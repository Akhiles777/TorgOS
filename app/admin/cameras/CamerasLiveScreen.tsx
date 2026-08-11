"use client";
import { useCallback, useState } from "react";
import { SegmentedControl, EmptyState } from "@/components/ui";
import { CameraTile } from "@/components/cameras/CameraTile";
import { useAgentStatus } from "@/components/cameras/useAgentStatus";

type StoreOption = { id: string; name: string };
type CameraOption = { id: string; name: string; agentId: string | null; agentStatus: "PENDING" | "ONLINE" | "OFFLINE" | null };
type AgentStatus = "PENDING" | "ONLINE" | "OFFLINE";

export function CamerasLiveScreen({ stores, camerasByStore }: { stores: StoreOption[]; camerasByStore: Record<string, CameraOption[]> }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [gridSize, setGridSize] = useState<"2x2" | "3x3">("2x2");
  const [agentOverrides, setAgentOverrides] = useState<Record<string, AgentStatus>>({});

  const onAgentStatus = useCallback((agentId: string, status: AgentStatus) => {
    setAgentOverrides((prev) => ({ ...prev, [agentId]: status }));
  }, []);
  useAgentStatus(onAgentStatus);

  const cameras = camerasByStore[storeId] ?? [];
  const gridCols = gridSize === "2x2" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {stores.length > 1 && (
          <SegmentedControl options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
        )}
        <SegmentedControl
          options={[
            { value: "2x2", label: "2×2" },
            { value: "3x3", label: "3×3" },
          ]}
          value={gridSize}
          onChange={(v) => setGridSize(v as "2x2" | "3x3")}
          className="ml-auto"
        />
      </div>

      {cameras.length === 0 ? (
        <EmptyState>Камер пока нет — добавьте регистратор в настройках камер.</EmptyState>
      ) : (
        <div className={`grid ${gridCols} gap-3`}>
          {cameras.map((c) => (
            <CameraTile
              key={c.id}
              cameraId={c.id}
              name={c.name}
              agentOnline={c.agentId ? (agentOverrides[c.agentId] ?? c.agentStatus) === "ONLINE" : true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
