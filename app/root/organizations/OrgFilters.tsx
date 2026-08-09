"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrgFilters({
  initialQuery,
  initialStatus,
  statuses,
  statusLabel,
}: {
  initialQuery: string;
  initialStatus: string;
  statuses: string[];
  statusLabel: Record<string, string>;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  const apply = (nextQ: string, nextStatus: string) => {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextStatus) params.set("status", nextStatus);
    router.push(`/root/organizations?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply(q, initialStatus)}
        placeholder="Поиск по названию…"
        className="h-9 px-3 bg-paper border border-line rounded-tag text-sm w-56 focus:border-ink"
      />
      <select
        value={initialStatus}
        onChange={(e) => apply(q, e.target.value)}
        className="h-9 px-2 bg-paper border border-line rounded-tag text-sm"
      >
        <option value="">Любой статус</option>
        {statuses.map((s) => (
          <option key={s} value={s}>{statusLabel[s]}</option>
        ))}
      </select>
      <button onClick={() => apply(q, initialStatus)} className="h-9 px-3 rounded-tag border border-line text-sm hover:bg-paper-2">
        Найти
      </button>
    </div>
  );
}
