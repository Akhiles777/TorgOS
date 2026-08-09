import { requireStoreScope } from "@/server/guard";
import { RemoteScanScreen } from "./RemoteScanScreen";

export const dynamic = "force-dynamic";

// Отдельный раздел: сканируете здесь (обычно с телефона), а пробивается на
// той кассе, что физически стоит на прилавке (обычно на компьютере) — код
// летит через WS в комнату точки, см. server.mjs + useRemoteScan в PosScreen.
export default async function PosScanPage() {
  await requireStoreScope("OWNER", "ADMIN", "CASHIER");
  return <RemoteScanScreen />;
}
