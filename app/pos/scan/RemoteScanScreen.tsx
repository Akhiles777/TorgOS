"use client";
// Приложение уже загружает шрифты приложения через AppShell/PosScreen — этот
// раздел открывают только с уже залогиненного устройства (обычно телефона),
// свой набор фонтов ему не нужен, подключаем то же самое здесь же.
import "@fontsource-variable/golos-text/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import { useState } from "react";
import Link from "next/link";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useScanBroadcast } from "@/components/pos/useScanBroadcast";
import { money0, unitLabel } from "@/lib/format";

type SentItem = { code: string; label: string | null; found: boolean; at: number };

// Раздел «Скан для кассы»: сканируете здесь (обычно с телефона), а строка
// добавляется в чек той кассы, что физически стоит на прилавке — код летит
// через WS в комнату точки (server.mjs), на кассе его ловит useRemoteScan
// и отдаёт в уже существующий handleScan — как будто он со проводного сканера.
export function RemoteScanScreen() {
  const { status, send } = useScanBroadcast();
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<SentItem[]>([]);

  const handleScan = async (code: string) => {
    const delivered = send(code);
    let label: string | null = null;
    let found = false;
    try {
      const res = await fetch(`/api/pos/lookup?barcode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.product) {
        label = `${data.product.name} · ${money0(data.product.price)} ₽/${unitLabel(data.product.unit)}`;
        found = true;
      }
    } catch {
      /* локальный просмотр — не критично, если не удался */
    }
    setItems((prev) => [{ code, label, found: found && delivered, at: Date.now() }, ...prev].slice(0, 30));
  };

  if (scanning) {
    return <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />;
  }

  return (
    <div className="min-h-[100dvh] bg-paper font-app-text flex flex-col">
      <header className="flex items-center justify-between gap-3 p-4 border-b border-line">
        <div>
          <h1 className="text-lg font-semibold">Скан для кассы</h1>
          <p className="text-xs text-ink-soft mt-0.5">Коды летят на кассу этой точки в реальном времени</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${status === "online" ? "bg-fresh" : status === "connecting" ? "bg-warn" : "bg-stamp"}`} />
          {status === "online" ? "Связь с кассой есть" : status === "connecting" ? "Подключение…" : "Нет связи"}
        </span>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-4">
        {status !== "online" && (
          <div className="bg-warn/10 border border-warn/40 text-warn-text text-sm rounded-tag p-3">
            Нет связи с сервером — коды не дойдут до кассы. Проверьте интернет на телефоне.
          </div>
        )}

        <button
          onClick={() => setScanning(true)}
          className="h-16 rounded-tag bg-ink text-paper text-lg font-medium active:scale-[0.98] transition"
        >
          Начать сканирование
        </button>

        <p className="text-sm text-ink-soft">
          Откройте эту страницу на телефоне, пока на компьютере на прилавке открыта касса
          (<Link href="/pos" className="underline underline-offset-2">/pos</Link>) под тем же магазином — сканы сами
          появятся в чеке там.
        </p>

        {items.length > 0 && (
          <div>
            <h2 className="text-xs text-ink-soft uppercase tracking-wide mb-2">Отправлено в этой сессии</h2>
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li key={`${it.code}-${it.at}-${i}`} className="flex items-center justify-between gap-2 bg-paper-2 border border-line rounded-tag px-3 py-2 text-sm">
                  <span className={it.found ? "" : "text-stamp-text"}>
                    {it.label ?? `Штрихкод ${it.code} — не найден на кассе`}
                  </span>
                  <span className="font-app-mono text-xs text-ink-soft shrink-0">
                    {new Date(it.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
