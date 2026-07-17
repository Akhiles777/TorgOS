"use client";
import { useState } from "react";
import { money0, dateShort } from "@/lib/format";

// Столбики выручки по дням — свой мини-график, без библиотек.
// Ось-подпись через hover/tap, значения моноширинные.
export function RevenueBars({ data }: { data: { date: string; revenue: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const shown = active ?? data.length - 1;
  const cur = data[shown];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-ink-soft">{dateShort(cur.date)}</span>
        <span className="font-mono-nums font-semibold tabular-nums text-lg">{money0(cur.revenue)} ₽</span>
      </div>
      <div className="flex items-end gap-1 h-28" role="img" aria-label="Выручка по дням">
        {data.map((d, i) => (
          <button
            key={d.date}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className="flex-1 min-w-0 group flex flex-col justify-end h-full"
            aria-label={`${dateShort(d.date)}: ${money0(d.revenue)} рублей`}
          >
            <span
              className={`w-full rounded-t-sm transition-colors ${i === shown ? "bg-stamp" : "bg-ink/25 group-hover:bg-ink/40"}`}
              style={{ height: `${Math.max(3, (d.revenue / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-ink-soft font-mono-nums">
        <span>{dateShort(data[0].date)}</span>
        <span>{dateShort(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}
