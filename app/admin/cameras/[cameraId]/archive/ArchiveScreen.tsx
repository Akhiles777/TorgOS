"use client";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { SegmentedControl, Button } from "@/components/ui";
import { Timeline, type TimeRange } from "@/components/cameras/Timeline";

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function ArchiveScreen({ cameraId, cameraName }: { cameraId: string; cameraName: string }) {
  const [day, setDay] = useState<Date>(todayStart);
  const [value, setValue] = useState<Date>(() => todayStart());
  const [speed, setSpeed] = useState<"1" | "2" | "4">("1");
  const [selection, setSelection] = useState<TimeRange | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = Number(speed);
  }, [speed]);

  // Плейбек открывается на 2-часовое окно от выбранной точки (или до конца
  // дня) — не бесконечный, чтобы не просить у регистратора весь день сразу,
  // но достаточно, чтобы не дёргать перезапрос на каждую минуту просмотра.
  const playRange = useMemo(() => {
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const to = new Date(Math.min(value.getTime() + 2 * 3600_000, dayEnd.getTime()));
    return { from: value, to };
  }, [value, day]);

  const src = `/api/cameras/${cameraId}/archive/stream.mp4?from=${encodeURIComponent(playRange.from.toISOString())}&to=${encodeURIComponent(playRange.to.toISOString())}`;

  function handleDateChange(e: ChangeEvent<HTMLInputElement>) {
    const d = new Date(`${e.target.value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setDay(d);
    setValue(new Date(d));
    setSelection(null);
  }

  function downloadUrl(): string {
    if (!selection) return "";
    return `/api/cameras/${cameraId}/archive/stream.mp4?from=${encodeURIComponent(selection.start.toISOString())}&to=${encodeURIComponent(selection.end.toISOString())}&download=1`;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-4">{cameraName} — архив</h1>

      <label className="block mb-4">
        <span className="block text-sm text-ink-soft mb-1">Дата</span>
        <input
          type="date"
          value={day.toISOString().slice(0, 10)}
          onChange={handleDateChange}
          max={new Date().toISOString().slice(0, 10)}
          className="h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink"
        />
      </label>

      <div className="bg-ink rounded-tag overflow-hidden aspect-video mb-3">
        {/* key=src — при смене диапазона плеер должен переинициализироваться, а не доигрывать старый источник */}
        <video ref={videoRef} key={src} src={src} controls autoPlay playsInline className="w-full h-full" />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-ink-soft">Скорость</span>
        <SegmentedControl
          options={[{ value: "1", label: "1×" }, { value: "2", label: "2×" }, { value: "4", label: "4×" }]}
          value={speed}
          onChange={(v) => setSpeed(v as "1" | "2" | "4")}
        />
      </div>

      <Timeline day={day} value={value} onSeek={setValue} selection={selection} onSelectionChange={setSelection} />

      <div className="mt-4 flex items-center gap-3">
        {selection ? (
          <>
            <span className="text-sm text-ink-soft">
              Выбрано: {formatTime(selection.start)}–{formatTime(selection.end)}
            </span>
            <a href={downloadUrl()} download>
              <Button variant="stamp">Скачать фрагмент</Button>
            </a>
          </>
        ) : (
          <span className="text-sm text-ink-soft">Потяните по шкале, чтобы выбрать участок для скачивания.</span>
        )}
      </div>
    </div>
  );
}
