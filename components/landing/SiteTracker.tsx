"use client";

import { useEffect } from "react";

const SESSION_KEY = "torgos_site_sid";
const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

type Payload = {
  type: "PAGEVIEW" | "SCROLL_25" | "SCROLL_50" | "SCROLL_75" | "SCROLL_100" | "CTA_CLICK";
  sessionId: string;
  path: string;
  referrer?: string;
  utmSource?: string;
  device?: "mobile" | "tablet" | "desktop";
  cta?: string;
};

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getDevice(): "mobile" | "tablet" | "desktop" {
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function send(payload: Payload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    if (ok) return;
  }
  fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

// Один компонент — один трекер на всю страницу (тот же принцип, что у
// ScrollReveal.tsx): один scroll-листенер, один делегированный click-листенер
// вместо колбэков на каждой кнопке (три из четырёх CTA — серверные компоненты,
// им нельзя передать onClick — см. отчёт по фиче).
export function SiteTracker() {
  useEffect(() => {
    const sessionId = getSessionId();
    const path = window.location.pathname;
    const device = getDevice();

    let referrer: string | undefined;
    try {
      referrer = document.referrer ? new URL(document.referrer).hostname : undefined;
    } catch {
      referrer = undefined;
    }
    const utmSource = new URLSearchParams(window.location.search).get("utm_source") ?? undefined;

    send({ type: "PAGEVIEW", sessionId, path, referrer, utmSource, device });

    const fired = new Set<number>();
    let throttled = false;

    const onScroll = () => {
      if (throttled) return;
      throttled = true;
      setTimeout(() => {
        throttled = false;
      }, 200);

      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const percent = scrollable <= 0 ? 100 : Math.round(((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100);

      for (const milestone of SCROLL_MILESTONES) {
        if (percent >= milestone && !fired.has(milestone)) {
          fired.add(milestone);
          send({ type: `SCROLL_${milestone}` as Payload["type"], sessionId, path });
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest<HTMLElement>("[data-track-cta]");
      if (!el) return;
      send({ type: "CTA_CLICK", sessionId, path, cta: el.dataset.trackCta });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
