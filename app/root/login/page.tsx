import { redirect } from "next/navigation";
import { getCurrentSuperAdmin } from "@/server/superAdminAuth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function RootLoginPage() {
  const sa = await getCurrentSuperAdmin();
  if (sa) redirect("/root");
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4 bg-ink">
      <div className="w-[min(92vw,360px)]">
        <div className="text-center mb-5">
          <div className="font-app-mono text-xs tracking-wide uppercase text-paper/50">ТоргОС</div>
          <div className="text-paper text-lg font-medium mt-0.5">root</div>
        </div>
        <div className="bg-paper border border-line rounded-tag p-5">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
