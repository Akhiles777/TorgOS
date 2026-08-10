"use client";

import { useState } from "react";
import { dateShort } from "@/lib/format";

type Point = { date: string; visits: number; ctaClicks: number; signups: number };

// Две линии, каждая от своего максимума — общая шкала свела бы регистрации
// (единицы в день) к нулю на фоне визитов (десятки-сотни). Честнее показать
// два независимых масштаба с явной подписью, чем одну ось, которая соврёт.
export function DailyTrendChart({ data }: { data: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? data.length - 1;
  const cur = data[shown];

  const W = 300;
  const H = 100;
  const PAD = 6;
  const maxVisits = Math.max(1, ...data.map((d) => d.visits));
  const maxSignups = Math.max(1, ...data.map((d) => d.signups));

  const x = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * W : W / 2);
  const yFor = (max: number, v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const visitsPoints = data.map((d, i) => `${x(i)},${yFor(maxVisits, d.visits)}`).join(" ");
  const signupsPoints = data.map((d, i) => `${x(i)},${yFor(maxSignups, d.signups)}`).join(" ");

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-ink-soft">{dateShort(cur.date)}</span>
        <span className="font-app-mono text-sm tabular-nums">
          <span className="text-stamp-text">{cur.visits} визитов</span>
          <span className="text-ink-soft"> · </span>
          <span className="text-fresh-text">{cur.signups} регистраций</span>
        </span>
      </div>

      <div className="relative h-32">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Визиты и регистрации по дням">
          <line x1={x(shown)} x2={x(shown)} y1="0" y2={H} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <polyline points={visitsPoints} fill="none" stroke="var(--color-stamp)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <polyline points={signupsPoints} fill="none" stroke="var(--color-fresh)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <button
              key={d.date}
              className="flex-1 h-full"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-label={`${dateShort(d.date)}: ${d.visits} визитов, ${d.signups} регистраций`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-stamp" aria-hidden />
          Визиты (своя шкала)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-fresh" aria-hidden />
          Регистрации (своя шкала)
        </span>
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-ink-soft font-app-mono">
        <span>{dateShort(data[0].date)}</span>
        <span>{dateShort(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}
