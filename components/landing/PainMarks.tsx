// Три рукописные пометки для секции «Знакомо?» — не иконки из набора,
// а собственные графические знаки на языке прилавка: надорванный лист,
// обрывок штрихкода, штамп с истекающим сроком.

export function TornPaperMark() {
  return (
    <span
      aria-hidden
      className="inline-block w-9 h-9 shrink-0 bg-land-ash-deep border border-land-graphite/20"
      style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 22% 100%, 0 68%)" }}
    />
  );
}

const BARCODE_WIDTHS = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1];

export function BarcodeMark() {
  return (
    <span aria-hidden className="inline-flex items-end gap-[2px] h-9 shrink-0">
      {BARCODE_WIDTHS.map((w, i) => (
        <span key={i} className="bg-land-graphite" style={{ width: w, height: i % 3 === 0 ? "100%" : "65%" }} />
      ))}
    </span>
  );
}

export function ExpiryStampMark() {
  return (
    <span
      aria-hidden
      className="inline-grid place-items-center w-9 h-9 shrink-0 rounded-full border-2 border-dashed border-land-signal/60 text-land-signal-text rotate-[-10deg]"
    >
      <span className="text-[8px] font-bold leading-none tracking-tight">СРОК</span>
    </span>
  );
}
