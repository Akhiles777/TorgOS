import Image from "next/image";
import { screenshotExists } from "@/lib/screenshotExists";

// Рамка под реальный скриншот: 1px граница --line, радиус карточки, тень из
// токенов — без изометрии, наклонов и макета ноутбука. Пока файла нет —
// не пустой прямоугольник во весь блок: сам блок остаётся в размере кадра
// (не пропадает контекст компоновки секции), а заглушка внутри — маленькая,
// с подписью, что здесь будет.
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
    <div className={`${aspect} rounded-land-card border border-land-line bg-land-surface flex items-center justify-center p-6 ${className}`}>
      <div className="border border-dashed border-land-line rounded-land-control px-5 py-4 text-center max-w-[80%]">
        <div className="font-landing-mono text-land-mono-sm text-land-muted uppercase tracking-[0.04em] mb-1.5">
          Скоро здесь
        </div>
        <div className="font-landing-text text-land-small text-land-ink">{label}</div>
      </div>
    </div>
  );
}
