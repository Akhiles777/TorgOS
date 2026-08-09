import { LandingButton } from "./LandingButton";

// Липкая — обоснование: аудитория 45+, полезнее не скроллить обратно наверх
// за кнопкой; шапка приложения (AppShell) тоже липкая — уже привычный паттерн.
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 bg-land-ash/95 backdrop-blur border-b border-land-graphite/10">
      <div className="max-w-[1180px] mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-1.5 sm:gap-3">
        <span className="font-landing-display text-base sm:text-xl tracking-wide text-land-graphite shrink-0">ТоргОС</span>
        <nav className="flex items-center gap-1 sm:gap-4 min-w-0">
          <LandingButton href="/login" variant="ghost" size="md" className="px-1.5 sm:px-3 h-auto py-2 text-sm sm:text-[15px] shrink-0">
            Войти
          </LandingButton>
          <LandingButton href="/register" variant="signal" size="md" className="px-2.5 sm:px-5 text-[13px] sm:text-[15px] shrink-0 whitespace-nowrap">
            Начать бесплатно
          </LandingButton>
        </nav>
      </div>
    </header>
  );
}
