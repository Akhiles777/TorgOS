"use client";

import { useState, useTransition } from "react";
import { updateLeadAction } from "@/app/root/actions";

type Lead = { id: string; name: string; contact: string; contactType: string; venueType: string; city: string; pointsCount: string; currentSystem: string; painPoint: string | null; readyToCall: boolean; createdAt: string; contactedAt: string | null; note: string | null };

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [rows, setRows] = useState(leads);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const save = (lead: Lead, form: HTMLFormElement) => {
    const data = new FormData(form);
    setPendingId(lead.id);
    startTransition(async () => {
      const result = await updateLeadAction(lead.id, data.get("contacted") === "on", String(data.get("note") ?? ""));
      setPendingId(null);
      if (result.ok) setRows((current) => current.map((item) => item.id === lead.id ? { ...item, contactedAt: data.get("contacted") === "on" ? new Date().toISOString() : null, note: String(data.get("note") ?? "") || null } : item));
    });
  };
  return <div className="border border-line rounded-tag overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="bg-paper-2 text-left text-ink-soft"><th className="px-3 py-2">Дата</th><th className="px-3 py-2">Контакт</th><th className="px-3 py-2">Заведение</th><th className="px-3 py-2">Учёт</th><th className="px-3 py-2">Что мешает</th><th className="px-3 py-2">Статус</th><th className="px-3 py-2">Действие</th></tr></thead><tbody>{rows.map((lead) => <tr key={lead.id} className="border-t border-line align-top"><td className="px-3 py-2 font-app-mono text-xs text-ink-soft">{new Date(lead.createdAt).toLocaleDateString("ru-RU")}</td><td className="px-3 py-2"><b>{lead.name}</b><div className="text-xs text-ink-soft">{lead.contact} ({lead.contactType})</div></td><td className="px-3 py-2">{lead.venueType}, {lead.city}<div className="text-xs text-ink-soft">Точек: {lead.pointsCount}</div></td><td className="px-3 py-2">{lead.currentSystem}</td><td className="px-3 py-2 max-w-[220px] whitespace-normal">{lead.painPoint || "-"}</td><td className="px-3 py-2">{lead.readyToCall && <span className="text-fresh-text">Готов к звонку</span>}<div className="text-xs text-ink-soft">{lead.contactedAt ? "Связались" : "Не связывались"}</div></td><td className="px-3 py-2"><form onSubmit={(event) => { event.preventDefault(); save(lead, event.currentTarget); }}><label className="flex gap-1.5 items-center text-xs mb-2"><input type="checkbox" name="contacted" defaultChecked={!!lead.contactedAt} /> связались</label><textarea name="note" defaultValue={lead.note ?? ""} rows={2} className="w-40 border border-line px-2 py-1 text-xs resize-none" placeholder="Заметка" /><button disabled={pendingId === lead.id} className="mt-1 h-7 px-2 border border-line rounded-tag text-xs hover:bg-paper-2">{pendingId === lead.id ? "..." : "Сохранить"}</button></form></td></tr>)}</tbody></table>{rows.length === 0 && <p className="p-6 text-center text-ink-soft">Заявок пока нет.</p>}</div>;
}