// Рендер EAN-13 в штрихи (SVG). Своя реализация, без библиотек.
// Нужен для печати ярлыков развесных/внутренних товаров.

const L: Record<string, string> = {
  "0": "0001101", "1": "0011001", "2": "0010011", "3": "0111101", "4": "0100011",
  "5": "0110001", "6": "0101111", "7": "0111011", "8": "0110111", "9": "0001011",
};
const G: Record<string, string> = {
  "0": "0100111", "1": "0110011", "2": "0011011", "3": "0100001", "4": "0011101",
  "5": "0111001", "6": "0000101", "7": "0010001", "8": "0001001", "9": "0010111",
};
const R: Record<string, string> = {
  "0": "1110010", "1": "1100110", "2": "1101100", "3": "1000010", "4": "1011100",
  "5": "1001110", "6": "1010000", "7": "1000100", "8": "1001000", "9": "1110100",
};
const PARITY: Record<string, string> = {
  "0": "LLLLLL", "1": "LLGLGG", "2": "LLGGLG", "3": "LLGGGL", "4": "LGLLGG",
  "5": "LGGLLG", "6": "LGGGLL", "7": "LGLGLG", "8": "LGLGGL", "9": "LGGLGL",
};

function encode(ean: string): string {
  const first = ean[0];
  const parity = PARITY[first];
  let bits = "101"; // левый guard
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[ean[i]];
  bits += "01010"; // центральный guard
  for (let i = 7; i <= 12; i++) bits += R[ean[i]];
  bits += "101"; // правый guard
  return bits;
}

export function Barcode({ value, height = 56, className = "" }: { value: string; height?: number; className?: string }) {
  if (!/^\d{13}$/.test(value)) return <span className="text-xs text-stamp">неверный код</span>;
  const bits = encode(value);
  const unit = 2;
  const width = bits.length * unit;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") {
      const start = x;
      let w = unit;
      while (i + 1 < bits.length && bits[i + 1] === "1") { w += unit; x += unit; i++; }
      bars.push({ x: start, w });
    }
    x += unit;
  }
  return (
    <svg viewBox={`0 0 ${width} ${height + 14}`} width={width} height={height + 14} className={className} role="img" aria-label={`Штрихкод ${value}`}>
      <rect width={width} height={height + 14} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
      <text x={width / 2} y={height + 11} textAnchor="middle" fontFamily="monospace" fontSize="11" fill="#000">
        {value}
      </text>
    </svg>
  );
}
