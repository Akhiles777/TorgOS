// Рамка под скриншот продукта — толстая графитовая окантовка, намёк на
// физический бецел экрана оборудования, а не «плейсхолдер, который забыли
// убрать». Пока нет реального кадра — честная подпись внутри рамки, не
// имитация интерфейса и не пунктирный прямоугольник «здесь что-то будет».
export function ScreenshotFrame({
  label,
  aspect = "aspect-[4/3]",
  className = "",
}: {
  label: string;
  aspect?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-tag border-4 border-land-graphite bg-land-ash-deep p-2 ${className}`}>
      <div className={`${aspect} rounded-[2px] bg-land-graphite/[0.06] grid place-items-center px-6 text-center`}>
        <span className="font-landing-text text-xs uppercase tracking-wide text-land-graphite-soft">
          Скриншот продукта · {label}
        </span>
      </div>
    </div>
  );
}
