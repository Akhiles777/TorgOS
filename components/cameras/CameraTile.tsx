"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCameraStream } from "./useCameraStream";

// Поток поднимается по требованию (плитка видна во вьюпорте или развёрнута
// на весь экран) и гаснет через ~30с после того, как перестала быть видна —
// см. отчёт по фиче. Сетка всегда использует пониженный поток (subtype=1 у
// Dahua) — восемь каналов основным потоком не влезают в исходящий канал
// магазина, полноэкранный режим — единственное место, где запрашивается
// основной.
const IDLE_STOP_MS = 30_000;

export function CameraTile({ cameraId, name, agentOnline }: { cameraId: string; name: string; agentOnline: boolean }) {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (visible || fullscreen) {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
      setActive(true);
    } else {
      idleTimer.current = setTimeout(() => setActive(false), IDLE_STOP_MS);
    }
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [visible, fullscreen]);

  const quality = fullscreen ? "main" : "sub";
  const { status, videoRef } = useCameraStream(cameraId, quality, active && agentOnline);
  const showNoSignal = !agentOnline || status === "no-signal";

  return (
    <div
      ref={containerRef}
      className={fullscreen ? "fixed inset-0 z-50 bg-ink" : "relative aspect-video bg-ink rounded-tag overflow-hidden"}
    >
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain bg-ink" />

      {!showNoSignal && (status === "idle" || status === "connecting") && (
        <div className="absolute inset-0 flex items-center justify-center text-paper/60 text-sm">Подключаюсь…</div>
      )}
      {showNoSignal && (
        <div className="absolute inset-0 flex items-center justify-center text-paper/60 text-sm bg-ink/80">
          {agentOnline ? "Нет сигнала" : "Агент офлайн"}
        </div>
      )}

      <div className="absolute top-2 left-2 text-paper text-sm font-medium drop-shadow">{name}</div>
      <div className="absolute bottom-2 right-2 flex gap-2">
        <Link
          href={`/admin/cameras/${cameraId}/archive`}
          className="px-2.5 h-8 inline-flex items-center rounded-tag bg-ink/70 text-paper text-xs font-medium hover:bg-ink/90"
        >
          Архив
        </Link>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="px-2.5 h-8 inline-flex items-center rounded-tag bg-ink/70 text-paper text-xs font-medium hover:bg-ink/90"
        >
          {fullscreen ? "Свернуть" : "На весь экран"}
        </button>
      </div>
    </div>
  );
}
