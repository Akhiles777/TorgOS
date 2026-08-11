"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { askCameraSetupAction } from "@/app/admin/cameras/settings/actions";
import type { CameraVendor } from "@prisma/client";

// Тот же формат, что AssistantChat.tsx (Приёмка ИИ), но грунтован строго на
// нашей инструкции по подключению камер, не общий ассистент — см. отчёт по фиче.
export function CameraSetupChat({ deviceContext }: { deviceContext?: { vendor: CameraVendor; host: string } }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = () => {
    setError(null);
    setAnswer(null);
    startTransition(async () => {
      const res = await askCameraSetupAction(question, deviceContext);
      if (res.ok) setAnswer(res.answer);
      else setError(res.error);
    });
  };

  return (
    <div className="bg-paper-2 border border-line rounded-tag p-3">
      <h3 className="font-medium text-sm mb-2">Спросить ИИ про подключение камер</h3>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        placeholder="Например: как узнать RTSP-адрес моего Dahua? Или: агент не выходит в онлайн, что проверить?"
        className="w-full px-3 py-2 bg-paper border border-line rounded-tag text-sm resize-none focus:border-ink"
      />
      <div className="flex justify-end mt-2">
        <Button variant="stamp" size="md" onClick={ask} disabled={pending || question.trim().length < 3}>
          {pending ? "Спрашиваю…" : "Спросить"}
        </Button>
      </div>
      {error && <p className="text-stamp-text text-sm mt-2">{error}</p>}
      {answer && <p className="text-sm mt-3 whitespace-pre-line leading-relaxed">{answer}</p>}
    </div>
  );
}
