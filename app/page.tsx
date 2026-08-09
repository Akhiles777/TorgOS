import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guard";
import { Landing } from "@/components/landing/Landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return <Landing />;
}
