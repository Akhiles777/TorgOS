import Image from "next/image";
import { screenshotExists } from "@/lib/screenshotExists";

// Схематичный контур интерфейса для заглушки: шапка с двумя точками меню,
// четыре строки списка (название слева / сумма справа), итоговый блок снизу.
// Не иконка и не фото — просто линии --land-line, чтобы блок читался как
// «здесь будет экран приложения», а не как случайная пустота.
function InterfaceSketch() {
  return (
    <svg viewBox="0 0 320 200" className="w-full max-w-60 text-land-line" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <rect x="8" y="8" width="304" height="24" rx="3" />
      <circle cx="21" cy="20" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="31" cy="20" r="2.5" fill="currentColor" stroke="none" />
      <line x1="8" y1="50" x2="180" y2="50" strokeLinecap="round" />
      <line x1="270" y1="50" x2="312" y2="50" strokeLinecap="round" />
      <line x1="8" y1="76" x2="200" y2="76" strokeLinecap="round" />
      <line x1="260" y1="76" x2="312" y2="76" strokeLinecap="round" />
      <line x1="8" y1="102" x2="160" y2="102" strokeLinecap="round" />
      <line x1="280" y1="102" x2="312" y2="102" strokeLinecap="round" />
      <line x1="8" y1="128" x2="190" y2="128" strokeLinecap="round" />
      <line x1="270" y1="128" x2="312" y2="128" strokeLinecap="round" />
      <rect x="8" y="156" width="304" height="32" rx="3" strokeWidth={2} />
    </svg>
  );
}

// Рамка под реальный скриншот: 1px граница --line, радиус карточки, тень из
// токенов — без изометрии, наклонов и макета ноутбука. Пока файла нет —
// заглушка ограничена по высоте (не больше 420px), внутри — схематичный
// контур интерфейса, а не пустой прямоугольник.
export function ProductScreenshot({
  file,
  alt,
  label,
  aspect = "aspect-[16/10]",
  priority = false,
  className = "",
}: {
  file: string;
  alt: string;
  label: string;
  aspect?: string;
  priority?: boolean;
  className?: string;
}) {
  const exists = screenshotExists(file);

  if (exists) {
    return (
      <div
        className={`relative ${aspect} rounded-land-card border border-land-line shadow-land-card overflow-hidden bg-land-surface ${className}`}
      >
        <Image src={`/screens/${file}`} alt={alt} fill priority={priority} sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`h-65 sm:h-85 lg:h-105 max-h-105 rounded-land-card border border-land-line bg-land-surface flex flex-col items-center justify-center gap-4 p-6 ${className}`}
    >
      <InterfaceSketch />
      <div className="text-center">
        <div className="font-landing-mono text-land-mono-sm text-land-muted uppercase tracking-[0.04em] mb-1">Скоро здесь</div>
        <div className="font-landing-text text-land-small text-land-ink">{label}</div>
      </div>
    </div>
  );
}
