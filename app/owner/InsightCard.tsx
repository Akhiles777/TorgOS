import type { Insight } from "@/server/insights";

// Общая карта серьёзности — раньше была независимо продублирована ещё раз
// в AiBriefingSection.tsx с расходящимся набором полей, теперь одна на двоих.
export const SEVERITY_TONE = {
  danger: { border: "border-stamp", bar: "bg-stamp", mark: "!", label: "срочно" },
  warn: { border: "border-warn", bar: "bg-warn", mark: "▲", label: "внимание" },
  info: { border: "border-line", bar: "bg-ink/40", mark: "i", label: "к сведению" },
} as const;

// Карточка рекомендации в виде ярлыка с «нитяной» дыркой. Тон — по severity,
// но различим не только цветом: у danger — двойная рамка и метка «!».
export function InsightCard({ insight }: { insight: Insight }) {
  const tone = SEVERITY_TONE[insight.severity];

  return (
    <div className={`relative bg-paper border ${tone.border} rounded-tag overflow-hidden`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${tone.bar}`} aria-hidden />
      <div className="pl-4 pr-3 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-5 h-5 shrink-0 grid place-items-center rounded-full text-xs font-bold text-paper ${tone.bar}`} aria-hidden>
            {tone.mark}
          </span>
          <span className="font-medium leading-tight">{insight.title}</span>
        </div>
        <p className="text-sm text-ink-soft leading-snug">{insight.body}</p>
        <div className="mt-2 font-app-mono text-xs inline-block px-2 py-0.5 rounded-full bg-paper-2 border border-line">
          {insight.metric}
        </div>
      </div>
    </div>
  );
}
