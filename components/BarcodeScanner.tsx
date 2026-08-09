"use client";
// Простой примитив: «дай мне распознанные коды» — onScan(code). Бизнес-логика
// каждого сценария (касса держит оверлей открытым, приёмка копит позиции,
// инвентаризация просит ввести факт. количество) остаётся у вызывающего экрана.
//
// Нативный BarcodeDetector — если браузер его поддерживает, используется он
// (быстрее, не тянет библиотеку); иначе — фолбэк на @zxing/browser (грузится
// динамически, чтобы не раздувать общий бандл для тех, у кого нативный есть).
// Оба пути разделяют один и тот же MediaStream — получаем его один раз, со
// связной обработкой ошибок и запасным вариантом, если запрошенные констрейнты
// не удовлетворить (например, у ноутбука нет задней камеры).
//
// «Умная» часть — не бутафория: реально замеряем яркость кадра (даунскейл на
// маленький canvas, средняя светимость по luma) и по ней и решаем, что
// показать и когда сама включить фонарик — а не просто держим статичный текст
// «в темноте включите фонарик» независимо от того, темно там на самом деле.
//
// Форматы намеренно ограничены тем, что реально встречается в магазине:
// EAN-13/EAN-8/UPC-A (товар), Code-128 (внутренние ярлыки), QR (на будущее).
import { useCallback, useEffect, useRef, useState } from "react";

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"];
const DEDUP_MS = 1800;
const DARK_THRESHOLD = 60; // средняя яркость 0-255, эмпирический порог «темно»
const DARK_HOLD_MS = 1800; // столько темнота должна продержаться, прежде чем сами включим фонарик

type Controls = { stop: () => void; switchTorch?: (on: boolean) => Promise<void> };
type Light = "ok" | "low" | "dark" | null; // null — ещё не замеряли

export function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchAuto, setTorchAuto] = useState(false); // фонарик включили мы сами, не человек
  const [light, setLight] = useState<Light>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");

  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const torchOnRef = useRef(false);
  const torchSupportedRef = useRef(false);
  const torchUserOverrideRef = useRef(false); // человек сам тронул фонарик — больше не лезем
  const darkSinceRef = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef = useRef<any>(null);
  const [justScanned, setJustScanned] = useState(false);

  // onScan почти всегда приходит инлайн-функцией (новая идентичность на
  // каждый ре-рендер родителя) — если бы «accept» зависел от неё напрямую,
  // главный эффект ниже пришлось бы перезапускать при каждом чужом ре-рендере,
  // а значит камера переоткрывалась бы посреди сессии сканирования. Держим
  // актуальный onScan в ref и не тянем его в зависимости эффекта вовсе.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Дедуп: один и тот же код в течение 1.5-2с не шлём повторно — иначе один
  // штрихкод в кадре превращается в десяток добавлений подряд.
  const accept = useCallback((code: string) => {
    const now = Date.now();
    const last = lastRef.current;
    if (last && last.code === code && now - last.at < DEDUP_MS) return;
    lastRef.current = { code, at: now };
    beep();
    if (navigator.vibrate) navigator.vibrate(60);
    setJustScanned(true);
    setTimeout(() => setJustScanned(false), 450);
    onScanRef.current(code);
  }, []);

  const setTorch = useCallback(async (on: boolean, auto: boolean) => {
    torchOnRef.current = on;
    setTorchOn(on);
    setTorchAuto(auto);
    await controlsRef.current?.switchTorch?.(on).catch(() => {});
  }, []);

  // Получаем поток камеры с осмысленными констрейнтами (задняя камера,
  // разрешение получше для точного декода, авто-фокус/экспозиция где есть) —
  // и одним понятным фолбэком, если такую камеру найти не удалось (обычный
  // случай для ноутбуков без задней камеры: OverconstrainedError).
  async function acquireStream(): Promise<MediaStream> {
    const preferred: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // Не все браузеры знают эти поля — применяются best-effort, без них просто нет автофокуса/автоэкспозиции
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [{ focusMode: "continuous" }, { exposureMode: "continuous" }] as any,
      },
    };
    try {
      return await navigator.mediaDevices.getUserMedia(preferred);
    } catch (e) {
      if (e instanceof DOMException && e.name === "OverconstrainedError") {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      throw e;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let lightTimer: ReturnType<typeof setInterval> | null = null;

    async function start() {
      try {
        if ("wakeLock" in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen").catch(() => null);
        }

        const stream = await acquireStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const track = stream.getVideoTracks()[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caps = (track?.getCapabilities?.() as any) ?? {};
        torchSupportedRef.current = !!caps.torch;
        setTorchSupported(!!caps.torch);
        controlsRef.current = {
          stop: () => stream.getTracks().forEach((t) => t.stop()),
          switchTorch: async (on: boolean) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await track.applyConstraints({ advanced: [{ torch: on } as any] }).catch(() => {});
          },
        };

        // Замер освещённости — независимо от того, какой путь распознавания
        // используется: маленький canvas, средняя яркость по luma. Пока темно
        // дольше DARK_HOLD_MS и фонарик доступен и человек его сам не трогал —
        // включаем сами.
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = 24;
        sampleCanvas.height = 24;
        const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
        lightTimer = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !sampleCtx) return;
          sampleCtx.drawImage(video, 0, 0, 24, 24);
          let data: Uint8ClampedArray;
          try {
            data = sampleCtx.getImageData(0, 0, 24, 24).data;
          } catch {
            return; // canvas «испачкан» (cross-origin) — молча пропускаем замер
          }
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          const avg = sum / (data.length / 4);
          const next: Light = avg < DARK_THRESHOLD ? "dark" : avg < DARK_THRESHOLD * 1.6 ? "low" : "ok";
          setLight(next);

          if (next === "dark") {
            if (darkSinceRef.current == null) darkSinceRef.current = Date.now();
            const heldLongEnough = Date.now() - darkSinceRef.current > DARK_HOLD_MS;
            if (heldLongEnough && torchSupportedRef.current && !torchOnRef.current && !torchUserOverrideRef.current) {
              void setTorch(true, true);
            }
          } else {
            darkSinceRef.current = null;
          }
        }, 400);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const NativeDetector = (window as any).BarcodeDetector;
        const supported: string[] = NativeDetector ? ((await NativeDetector.getSupportedFormats?.()) ?? []) : [];
        const nativeFormats = NATIVE_FORMATS.filter((f) => supported.includes(f));

        if (NativeDetector && nativeFormats.length) {
          const detector = new NativeDetector({ formats: nativeFormats });
          setStarting(false);
          pollTimer = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes[0]?.rawValue) accept(codes[0].rawValue);
            } catch {
              // кадр не распознан — это нормально, ждём следующий
            }
          }, 300);
          return;
        }

        // Фолбэк: @zxing/browser — грузим только когда реально нужен, и
        // переиспользуем уже полученный stream (не открываем камеру второй раз).
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromStream(stream, videoRef.current ?? undefined, (result) => {
          if (result) accept(result.getText());
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        // decodeFromStream не сам стопает медиатреки — совмещаем со «старым»
        // stop (он их останавливает) в новую функцию. Важно захватить старый
        // stop в переменную ДО переприсваивания controlsRef.current — иначе
        // новый stop() будет звать сам себя через controlsRef и уйдёт в рекурсию.
        const stopStream = controlsRef.current?.stop;
        const stopZxing = controls.stop.bind(controls);
        controlsRef.current = {
          switchTorch: controlsRef.current?.switchTorch,
          stop: () => { stopZxing(); stopStream?.(); },
        };
        setStarting(false);
      } catch (e) {
        setStarting(false);
        setError(friendlyCameraError(e));
        setManualOpen(true);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (lightTimer) clearInterval(lightTimer);
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wakeLockRef.current?.release?.().catch?.(() => {});
    };
  }, [accept, setTorch]);

  const toggleTorch = () => {
    torchUserOverrideRef.current = true; // человек решил сам — больше не автоматизируем в этом сеансе
    void setTorch(!torchOnRef.current, false);
  };

  const submitManual = () => {
    const v = manualValue.trim();
    if (!v) return;
    setManualValue("");
    onScan(v);
  };

  const hint =
    light === "dark"
      ? torchSupported
        ? torchAuto
          ? "Темно — включил фонарик автоматически."
          : "Темно — сейчас включу фонарик…"
        : "Темно, а фонарика на этом устройстве нет — поднесите товар ближе к источнику света."
      : light === "low"
        ? "Освещения маловато — если не распознаётся, включите фонарик."
        : "Держите штрихкод в рамке, на расстоянии 10-15 см.";

  return (
    // z-30 — ниже флеш-уведомлений (z-40) и модалок (z-50): если скан требует
    // модалку (вес, оплата) или триггерит флеш, они обязаны лечь поверх камеры.
    <div className="fixed inset-0 z-30 bg-ink flex flex-col" role="dialog" aria-label="Сканирование штрихкода">
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        {!error && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div
              className={`w-[78vw] max-w-80 aspect-[2/1] border-2 rounded-tag transition-colors duration-150 ${
                justScanned ? "border-fresh" : light === "dark" ? "border-warn" : "border-paper/70"
              }`}
            />
          </div>
        )}
        {starting && !error && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-paper/80 text-sm">Включаю камеру…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <p className="text-paper text-sm max-w-64">{error}</p>
          </div>
        )}

        {/* Верхняя панель: закрыть, фонарик */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between p-3 sm:p-4">
          <button
            onClick={onClose}
            className="h-14 px-4 rounded-tag bg-ink/70 text-paper font-medium border border-paper/20"
            aria-label="Закрыть сканер"
          >
            Закрыть
          </button>
          {torchSupported && (
            <button
              onClick={toggleTorch}
              className={`h-14 px-4 rounded-tag border font-medium transition-colors ${
                torchOn ? "bg-warn text-ink border-warn" : light === "dark" ? "bg-warn/20 text-warn border-warn animate-pulse" : "bg-ink/70 text-paper border-paper/20"
              }`}
            >
              {torchOn ? "Фонарик: вкл" : "Фонарик"}
            </button>
          )}
        </div>

        {/* Подсказка — по реальному замеру яркости, не статичный текст */}
        {!error && (
          <div className="absolute bottom-0 inset-x-0 p-3 sm:p-4 text-center">
            <p className={`text-xs ${light === "dark" ? "text-warn font-medium" : "text-paper/80"}`}>{hint}</p>
          </div>
        )}
      </div>

      {/* Ручной ввод — всегда доступен, не только когда камера недоступна */}
      <div className="shrink-0 bg-paper border-t border-line p-3 sm:p-4">
        {manualOpen ? (
          <div className="flex gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitManual()}
              placeholder="Код вручную"
              className="flex-1 h-14 px-3 bg-paper border border-line rounded-tag font-app-mono text-lg focus:border-ink"
            />
            <button onClick={submitManual} className="h-14 px-5 rounded-tag bg-ink text-paper font-medium">
              Ввести
            </button>
          </div>
        ) : (
          <button onClick={() => setManualOpen(true)} className="w-full h-14 rounded-tag border border-line text-ink-soft font-medium">
            Ввести код вручную
          </button>
        )}
        <p className="text-[11px] text-ink-soft text-center mt-2">Видео не покидает браузер — камера обрабатывается локально, ничего не отправляется на сервер.</p>
      </div>
    </div>
  );
}

function friendlyCameraError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") return "Доступ к камере запрещён. Разрешите его в настройках браузера и попробуйте снова.";
    if (e.name === "NotFoundError") return "На этом устройстве не нашлась камера.";
    if (e.name === "NotReadableError") return "Камера занята другим приложением — закройте его и попробуйте снова.";
  }
  return "Нет доступа к камере. Разрешите доступ в браузере или введите код вручную.";
}

// Синтезированный «бип» вместо аудиофайла — Web Audio API, короткий тон.
function beep() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch {
    // звук — не критично, если Web Audio недоступен
  }
}
