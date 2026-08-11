"use client";
import { useCallback, useRef, useState, type MouseEvent } from "react";

// Горизонтальная шкала 00:00-24:00 — клик переставляет курсор воспроизведения,
// протяжка (drag) выделяет диапазон для скачивания фрагмента. Список записанных
// файлов НЕ размечен на шкале — см. отчёт по фиче: CGI-поиск файлов регистратора
// не проверен на реальном устройстве, вся шкала кликабельна целиком (разрешённый
// брифом деградированный режим), а не только «зелёные» участки с записью.
const DAY_MS = 86_400_000;

function xToTime(x: number, dayStart: Date, width: number): Date {
  const frac = Math.max(0, Math.min(1, width > 0 ? x / width : 0));
  return new Date(dayStart.getTime() + frac * DAY_MS);
}

function timeToPct(date: Date, dayStart: Date): number {
  const ms = date.getTime() - dayStart.getTime();
  return Math.max(0, Math.min(100, (ms / DAY_MS) * 100));
}

export type TimeRange = { start: Date; end: Date };

export function Timeline({
  day,
  value,
  onSeek,
  selection,
  onSelectionChange,
}: {
  day: Date;
  value: Date;
  onSeek: (t: Date) => void;
  selection: TimeRange | null;
  onSelectionChange: (r: TimeRange | null) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragged, setDragged] = useState(false);

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);

  const posFromEvent = useCallback(
    (e: MouseEvent) => {
      const bar = barRef.current;
      if (!bar) return null;
      const rect = bar.getBoundingClientRect();
      return xToTime(e.clientX - rect.left, dayStart, rect.width);
    },
    [dayStart],
  );

  function handleMouseDown(e: MouseEvent) {
    const t = posFromEvent(e);
    if (!t) return;
    setDragStart(t);
    setDragged(false);
    onSelectionChange(null);
  }
  function handleMouseMove(e: MouseEvent) {
    if (!dragStart) return;
    const t = posFromEvent(e);
    if (!t) return;
    if (Math.abs(t.getTime() - dragStart.getTime()) > 5000) {
      setDragged(true);
      const start = t < dragStart ? t : dragStart;
      const end = t < dragStart ? dragStart : t;
      onSelectionChange({ start, end });
    }
  }
  function handleMouseUp(e: MouseEvent) {
    if (dragStart && !dragged) {
      const t = posFromEvent(e);
      if (t) onSeek(t);
    }
    setDragStart(null);
    setDragged(false);
  }

  const hourMarks = Array.from({ length: 8 }, (_, i) => i * 3); // каждые 3 часа

  return (
    <div className="select-none">
      <div
        ref={barRef}
        className="relative h-16 bg-paper-2 border border-line rounded-tag cursor-pointer overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDragStart(null)}
      >
        {selection && (
          <div
            className="absolute top-0 bottom-0 bg-stamp/20 border-x border-stamp pointer-events-none"
            style={{ left: `${timeToPct(selection.start, dayStart)}%`, width: `${timeToPct(selection.end, dayStart) - timeToPct(selection.start, dayStart)}%` }}
          />
        )}
        {hourMarks.map((h) => (
          <div key={h} className="absolute top-0 bottom-0 border-l border-line/60 pointer-events-none" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-ink pointer-events-none"
          style={{ left: `${timeToPct(value, dayStart)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-ink-soft font-app-mono">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>
    </div>
  );
}
