"use client";
import { useEffect, useState } from "react";
import { LandingButton } from "./LandingButton";

// Липкая, высота постоянна (граница всегда 1px — прозрачная либо цветная,
// не появляется заново). Ниже 80px скролла — граница + тень, переход 200ms,
// отключается при prefers-reduced-motion (motion-reduce: — просто без
// анимации, конечное состояние то же).
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 bg-land-paper/95 backdrop-blur border-b transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${
        scrolled ? "border-land-line shadow-land-card" : "border-transparent"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-3">
        <span className="font-landing-display font-bold text-land-ink text-lg tracking-[-0.02em]">ТоргОС</span>
        <nav className="flex items-center gap-2 sm:gap-4">
          <LandingButton href="/login" variant="ghost" size="md" className="px-2 sm:px-3 h-auto py-2">
            Войти
          </LandingButton>
          <LandingButton href="/register" variant="signal" size="md" trackId="header">
            Начать бесплатно
          </LandingButton>
        </nav>
      </div>
    </header>
  );
}
