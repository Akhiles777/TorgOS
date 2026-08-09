"use client";
// Простой примитив: «дай мне распознанные коды» — onScan(code). Бизнес-логика
// каждого сценария (касса держит оверлей открытым, приёмка копит позиции,
// инвентаризация просит ввести факт. количество) остаётся у вызывающего экрана.
//
// Нативный BarcodeDetector — если браузер его поддерживает, используется он
// (быстрее, не тянет библиотеку); иначе — фолбэк на @zxing/browser (грузится
// динамически, чтобы не раздувать общий бандл для тех, у кого нативный есть).
// Форматы намеренно ограничены тем, что реально встречается в магазине:
// EAN-13/EAN-8/UPC-A (товар), Code-128 (внутренние ярлыки), QR (на будущее).
import { useCallback, useEffect, useRef, useState } from "react";

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"];
const DEDUP_MS = 1800;

type Controls = { stop: () => void; switchTorch?: (on: boolean) => Promise<void> };

export function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");

  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef = useRef<any>(null);

  // Дедуп: один и тот же код в течение 1.5-2с не шлём повторно — иначе один
  // штрихкод в кадре превращается в десяток добавлений подряд.
  const accept = useCallback(
    (code: string) => {
      const now = Date.now();
      const last = lastRef.current;
      if (last && last.code === code && now - last.at < DEDUP_MS) return;
      lastRef.current = { code, at: now };
      beep();
      if (navigator.vibrate) navigator.vibrate(60);
      onScan(code);
    },
    [onScan],
  );

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function start() {
      try {
        if ("wakeLock" in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen").catch(() => null);
        }

        const constraints: MediaStreamConstraints = { video: { facingMode: "environment" }, audio: false };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const NativeDetector = (window as any).BarcodeDetector;

        if (NativeDetector) {
          const supported: string[] = (await NativeDetector.getSupportedFormats?.()) ?? [];
          const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
          if (formats.length) {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
            const caps = (track.getCapabilities?.() as any) ?? {};
            setTorchSupported(!!caps.torch);
            controlsRef.current = {
              stop: () => stream.getTracks().forEach((t) => t.stop()),
              switchTorch: async (on: boolean) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await track.applyConstraints({ advanced: [{ torch: on } as any] }).catch(() => {});
              },
            };
            const detector = new NativeDetector({ formats });
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
        }

        // Фолбэк: @zxing/browser — грузим только когда реально нужен
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
        const controls = await reader.decodeFromConstraints(constraints, videoRef.current ?? undefined, (result) => {
          if (result) accept(result.getText());
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
        const stream = videoRef.current?.srcObject as MediaStream | undefined;
        if (stream) {
          streamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caps = (track?.getCapabilities?.() as any) ?? {};
          setTorchSupported(!!caps.torch);
        }
      } catch {
        setStarting(false);
        setError("Нет доступа к камере. Разрешите доступ в браузере или введите код вручную.");
        setManualOpen(true);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wakeLockRef.current?.release?.().catch?.(() => {});
    };
  }, [accept]);

  const toggleTorch = async () => {
    const next = !torchOn;
    setTorchOn(next);
    await controlsRef.current?.switchTorch?.(next);
  };

  const submitManual = () => {
    const v = manualValue.trim();
    if (!v) return;
    setManualValue("");
    onScan(v);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-ink flex flex-col" role="dialog" aria-label="Сканирование штрихкода">
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        {!error && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="w-[78vw] max-w-80 aspect-[2/1] border-2 border-paper/70 rounded-tag" />
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
              className={`h-14 px-4 rounded-tag border font-medium ${
                torchOn ? "bg-warn text-ink border-warn" : "bg-ink/70 text-paper border-paper/20"
              }`}
            >
              {torchOn ? "Фонарик: вкл" : "Фонарик"}
            </button>
          )}
        </div>

        {/* Подсказка при плохом освещении — стабильно видна, не завязана на реальный замер света */}
        {!error && (
          <div className="absolute bottom-0 inset-x-0 p-3 sm:p-4 text-center">
            <p className="text-paper/80 text-xs">
              Держите штрихкод в рамке, на расстоянии 10-15 см. В темноте — включите фонарик.
            </p>
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
