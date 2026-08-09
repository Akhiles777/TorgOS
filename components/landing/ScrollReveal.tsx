"use client";

import { useEffect } from "react";

const SELECTOR = "[data-reveal-section], [data-reveal], [data-reveal-row]";

// Один IntersectionObserver на всю страницу вместо N хуков в каждой секции —
// проще снять после первого срабатывания (once) и не плодить обсерверы.
export function ScrollReveal() {
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));

    if (prefersReduced) {
      els.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    // 60мс шаг между «соседями» — сиблингами внутри общего родителя.
    const byParent = new Map<Element | null, HTMLElement[]>();
    els.forEach((el) => {
      const siblings = byParent.get(el.parentElement) ?? [];
      siblings.push(el);
      byParent.set(el.parentElement, siblings);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const explicitDelay = el.dataset.revealDelay;
          const siblings = byParent.get(el.parentElement) ?? [el];
          const index = explicitDelay !== undefined ? Number(explicitDelay) : siblings.indexOf(el);
          el.style.transitionDelay = `${index * 60}ms`;
          el.classList.add("is-revealed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
