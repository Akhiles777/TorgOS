// Честная заглушка вместо скриншота продукта — пока нет реального кадра,
// не имитируем UI, просто подписываем, что здесь будет.
export function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={`Здесь будет скриншот: ${label}`}
      className="rounded-tag border-2 border-dashed border-line bg-paper-2 aspect-video grid place-items-center px-4 text-center"
    >
      <span className="text-xs text-ink-soft uppercase tracking-wide">Скриншот · {label}</span>
    </div>
  );
}
