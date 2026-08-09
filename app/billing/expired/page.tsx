import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guard";
import { tenantDb } from "@/server/tenant";
import { logoutAction } from "@/app/logout/action";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

// Не через requireRole — та сама сюда редиректит при блокировке, а этот
// экран обязан быть достижим именно в заблокированном состоянии.
export default async function BillingExpiredPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = tenantDb(user.organizationId);
  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true, subscriptionStatus: true, trialEndsAt: true },
  });

  const stillBlocked =
    !!org &&
    org.subscriptionStatus !== "ACTIVE" &&
    (org.subscriptionStatus !== "TRIAL" || (!!org.trialEndsAt && org.trialEndsAt.getTime() < Date.now()));

  // Если подписку уже продлили (или что-то поправили руками) — не держим на этом экране.
  if (!stillBlocked) redirect(homeFor(user.role));

  const trialEndsAt = org?.trialEndsAt
    ? org.trialEndsAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="min-h-[100dvh] grid place-items-center p-4 font-app-text">
      <div className="w-[min(92vw,440px)] text-center">
        <div className="font-app-display text-2xl font-medium tracking-tight mb-1">ТоргОС</div>

        {user.role === "OWNER" ? (
          <>
            <div className="bg-paper-2 border border-line rounded-tag p-6 mt-5 receipt-torn text-left">
              <h1 className="text-xl font-semibold mb-1">Доступ приостановлен</h1>
              <p className="text-ink-soft text-sm mb-4">
                {trialEndsAt ? `Бесплatный период «${org?.name}» закончился ${trialEndsAt}.` : `Подписка «${org?.name}» неактивна.`}
                {" "}Данные никуда не делись — как только продлите, всё будет на месте.
              </p>
              <div className="flex items-baseline py-2 border-t border-b border-dashed border-line">
                <span className="font-medium">Продление</span>
                <span className="leader" aria-hidden />
                <span className="font-app-mono font-semibold">от ___ ₽/мес</span>
              </div>
              <p className="text-xs text-ink-soft mt-3">
                Реальная оплата пока не подключена — напишите нам на <span className="font-app-mono">___@storeos.online</span>,
                продлим вручную.
              </p>
            </div>
            <form action={logoutAction} className="mt-5">
              <Button type="submit" variant="line" size="lg" className="w-full">
                Выйти
              </Button>
            </form>
          </>
        ) : (
          <div className="bg-paper-2 border border-line rounded-tag p-6 mt-5">
            <h1 className="text-xl font-semibold mb-2">Доступ приостановлен</h1>
            <p className="text-ink-soft text-sm">
              Владелец ещё не продлил подписку «{org?.name}». Обратитесь к нему — как только продлит, всё снова заработает.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
