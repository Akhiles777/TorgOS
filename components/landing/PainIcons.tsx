// Три собственные иконки для «Знакомо?» — тонкая линия 1.5px, currentColor,
// 40×40, единая манера. Не из готового набора (Lucide/Heroicons и т.п.).
const common = {
  width: 40,
  height: 40,
  viewBox: "0 0 40 40",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// Тетрадь с ручкой — «учёт на бумаге»
export function NotebookIcon() {
  return (
    <svg {...common}>
      <rect x="9" y="7" width="20" height="26" rx="1.5" />
      <path d="M9 12.5h20M9 18h20M9 23.5h13" />
      <path d="M25 26.5l6-6 2.5 2.5-6 6H25v-2.5Z" />
    </svg>
  );
}

// Перечёркнутый глаз — «недостачи, которых не видно»
export function HiddenIcon() {
  return (
    <svg {...common}>
      <path d="M8 20c3-5.5 7.5-8.5 12-8.5S28.5 14.5 32 20c-3 5.5-7.5 8.5-12 8.5S11 25.5 8 20Z" />
      <circle cx="20" cy="20" r="3.5" />
      <path d="M10 30 30 10" />
    </svg>
  );
}

// Часы — «то протухает, то заканчивается» (время истекло)
export function ClockIcon() {
  return (
    <svg {...common}>
      <circle cx="20" cy="20" r="13" />
      <path d="M20 12.5V20l6 3.5" />
    </svg>
  );
}
