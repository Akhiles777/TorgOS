"use client";
import { useState, useTransition } from "react";
import { Card, Button, Badge, EmptyState, Modal, ConfirmDialog, Field, SegmentedControl } from "@/components/ui";
import { CameraSetupChat } from "@/components/cameras/CameraSetupChat";
import {
  createAgentAction, deleteAgentAction, createDeviceAction, updateDeviceAction, deleteDeviceAction,
  testConnectionAction, createCameraAction, updateCameraAction, deleteCameraAction, type DeviceFormInput,
} from "./actions";
import type { CameraVendor, CameraConnectionMode } from "@prisma/client";
import type { TestConnectionResult } from "@/server/services/cameras";

type AgentStatus = "PENDING" | "ONLINE" | "OFFLINE";
type Agent = { id: string; name: string; status: AgentStatus; lastSeenAt: string | null; agentVersion: string | null; deviceCount: number };
type CameraRow = { id: string; deviceId: string; channel: number; name: string; enabled: boolean; sortOrder: number };
type Device = {
  id: string; name: string; vendor: CameraVendor; connection: CameraConnectionMode; agentId: string | null;
  agentName: string | null; agentStatus: AgentStatus | null;
  host: string; rtspPort: number; httpPort: number; username: string; channelCount: number;
  clockOffsetSec: number | null; clockCheckedAt: string | null; cameras: CameraRow[];
};

const VENDOR_LABELS: Record<CameraVendor, string> = { DAHUA: "Dahua", HIKVISION: "Hikvision", GENERIC: "Другой" };
const AGENT_STATUS_LABELS: Record<AgentStatus, string> = { PENDING: "Не подключён", ONLINE: "Онлайн", OFFLINE: "Офлайн" };

export function CamerasSettingsScreen({
  storeId, initialAgents, initialDevices, serverWsUrl, agentDistOrigin,
}: {
  storeId: string; initialAgents: Agent[]; initialDevices: Device[]; serverWsUrl: string; agentDistOrigin: string;
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [devices, setDevices] = useState(initialDevices);
  const [newAgentToken, setNewAgentToken] = useState<{ name: string; token: string } | null>(null);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [deviceForm, setDeviceForm] = useState<{ mode: "create" } | { mode: "edit"; device: Device } | null>(null);
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<Agent | null>(null);
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<Device | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResult>>({});
  const [pending, startTransition] = useTransition();

  function createAgent() {
    if (!agentName.trim()) return;
    const name = agentName.trim();
    startTransition(async () => {
      const res = await createAgentAction(storeId, name);
      if (res.ok) {
        setNewAgentToken({ name, token: res.token });
        setAgents((prev) => [...prev, { id: res.id, name, status: "PENDING", lastSeenAt: null, agentVersion: null, deviceCount: 0 }]);
        setAgentName("");
        setShowAgentForm(false);
      }
    });
  }

  function removeAgent(agent: Agent) {
    startTransition(async () => {
      const res = await deleteAgentAction(storeId, agent.id);
      if (res.ok) setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      setConfirmDeleteAgent(null);
    });
  }

  function removeDevice(device: Device) {
    startTransition(async () => {
      const res = await deleteDeviceAction(storeId, device.id);
      if (res.ok) setDevices((prev) => prev.filter((d) => d.id !== device.id));
      setConfirmDeleteDevice(null);
    });
  }

  function testConnection(deviceId: string) {
    startTransition(async () => {
      const res = await testConnectionAction(storeId, deviceId);
      setTestResults((prev) => ({ ...prev, [deviceId]: res }));
    });
  }

  const installCommand = newAgentToken ? `curl -fsSL ${agentDistOrigin}/agent-dist/install.sh | sudo bash -s -- ${newAgentToken.token} ${serverWsUrl}` : "";

  return (
    <div className="space-y-6 max-w-3xl">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Агенты точки</h2>
          <Button variant="stamp" size="md" onClick={() => setShowAgentForm(true)}>Добавить агента</Button>
        </div>
        {agents.length === 0 ? (
          <EmptyState>Агентов пока нет — нужен для регистратора за NAT (обычный случай для магазина).</EmptyState>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <Card key={a.id} className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-ink-soft">
                    {a.lastSeenAt ? `на связи ${new Date(a.lastSeenAt).toLocaleString("ru-RU")}` : "ещё не подключался"}
                    {a.deviceCount > 0 && ` · устройств: ${a.deviceCount}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.status === "ONLINE" ? "fresh" : a.status === "OFFLINE" ? "stamp" : "line"}>{AGENT_STATUS_LABELS[a.status]}</Badge>
                  <button className="text-xs text-ink-soft hover:text-stamp-text" onClick={() => setConfirmDeleteAgent(a)}>удалить</button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Регистраторы</h2>
          <Button variant="stamp" size="md" onClick={() => setDeviceForm({ mode: "create" })}>Добавить устройство</Button>
        </div>
        {devices.length === 0 ? (
          <EmptyState>Устройств пока нет.</EmptyState>
        ) : (
          <div className="space-y-3">
            {devices.map((d) => (
              <DeviceCard
                key={d.id}
                storeId={storeId}
                device={d}
                testResult={testResults[d.id]}
                onTest={() => testConnection(d.id)}
                onEdit={() => setDeviceForm({ mode: "edit", device: d })}
                onDelete={() => setConfirmDeleteDevice(d)}
                onCamerasChange={(cameras) => setDevices((prev) => prev.map((x) => (x.id === d.id ? { ...x, cameras } : x)))}
              />
            ))}
          </div>
        )}
      </section>

      <CameraSetupChat />

      {showAgentForm && (
        <Modal onCancel={() => setShowAgentForm(false)}>
          <div className="w-[min(92vw,380px)]">
            <h2 className="text-lg font-semibold mb-3">Новый агент</h2>
            <Field label="Название" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Агент — торговый зал" autoFocus />
            <div className="flex gap-3 mt-4">
              <Button variant="line" size="lg" onClick={() => setShowAgentForm(false)}>Отмена</Button>
              <Button variant="stamp" size="lg" onClick={createAgent} disabled={pending || !agentName.trim()}>Создать</Button>
            </div>
          </div>
        </Modal>
      )}

      {newAgentToken && (
        <Modal onCancel={() => setNewAgentToken(null)}>
          <div className="w-[min(92vw,520px)]">
            <h2 className="text-lg font-semibold mb-2">Агент «{newAgentToken.name}» создан</h2>
            <p className="text-sm text-ink-soft mb-3">
              Токен показывается только сейчас — если закроете окно, посмотреть его снова не получится (придётся
              создать нового агента). Выполните эту команду на мини-ПК/Raspberry Pi рядом с регистратором:
            </p>
            <pre className="bg-ink text-paper text-xs p-3 rounded-tag overflow-x-auto whitespace-pre-wrap break-all">{installCommand}</pre>
            <div className="flex justify-end mt-4">
              <Button variant="stamp" size="lg" onClick={() => setNewAgentToken(null)}>Готово</Button>
            </div>
          </div>
        </Modal>
      )}

      {deviceForm && (
        <DeviceFormModal
          storeId={storeId}
          agents={agents}
          initial={deviceForm.mode === "edit" ? deviceForm.device : null}
          onCancel={() => setDeviceForm(null)}
          onSaved={(device) => {
            setDevices((prev) => (deviceForm.mode === "edit" ? prev.map((d) => (d.id === device.id ? device : d)) : [...prev, device]));
            setDeviceForm(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteAgent}
        title="Удалить агента?"
        body={confirmDeleteAgent && confirmDeleteAgent.deviceCount > 0 ? "За агентом закреплены устройства — сначала удалите или отвяжите их." : undefined}
        busy={pending}
        onConfirm={() => confirmDeleteAgent && removeAgent(confirmDeleteAgent)}
        onCancel={() => setConfirmDeleteAgent(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteDevice}
        title="Удалить устройство?"
        body="Все каналы этого устройства тоже будут удалены."
        busy={pending}
        onConfirm={() => confirmDeleteDevice && removeDevice(confirmDeleteDevice)}
        onCancel={() => setConfirmDeleteDevice(null)}
      />
    </div>
  );
}

function DeviceCard({
  storeId, device, testResult, onTest, onEdit, onDelete, onCamerasChange,
}: {
  storeId: string; device: Device; testResult?: TestConnectionResult;
  onTest: () => void; onEdit: () => void; onDelete: () => void; onCamerasChange: (cameras: CameraRow[]) => void;
}) {
  const [showCameraForm, setShowCameraForm] = useState(false);
  const [channel, setChannel] = useState("1");
  const [cameraName, setCameraName] = useState("");
  const [pending, startTransition] = useTransition();

  function addCamera() {
    const ch = parseInt(channel, 10);
    if (!Number.isFinite(ch) || !cameraName.trim()) return;
    const name = cameraName.trim();
    startTransition(async () => {
      const res = await createCameraAction(storeId, device.id, { channel: ch, name });
      if (res.ok) {
        onCamerasChange([...device.cameras, { id: res.id, deviceId: device.id, channel: ch, name, enabled: true, sortOrder: device.cameras.length }]);
        setCameraName("");
        setChannel(String(ch + 1));
        setShowCameraForm(false);
      }
    });
  }

  function toggleCamera(cam: CameraRow) {
    startTransition(async () => {
      const res = await updateCameraAction(storeId, cam.id, { enabled: !cam.enabled });
      if (res.ok) onCamerasChange(device.cameras.map((c) => (c.id === cam.id ? { ...c, enabled: !c.enabled } : c)));
    });
  }

  function removeCamera(cam: CameraRow) {
    startTransition(async () => {
      const res = await deleteCameraAction(storeId, cam.id);
      if (res.ok) onCamerasChange(device.cameras.filter((c) => c.id !== cam.id));
    });
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{device.name}</div>
          <div className="text-xs text-ink-soft">
            {VENDOR_LABELS[device.vendor]} · {device.host}:{device.rtspPort} ·{" "}
            {device.connection === "AGENT" ? `через агента «${device.agentName ?? "?"}»` : "напрямую (белый IP)"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="text-xs text-ink-soft hover:text-ink" onClick={onEdit}>изменить</button>
          <button className="text-xs text-ink-soft hover:text-stamp-text" onClick={onDelete}>удалить</button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Button variant="line" size="md" onClick={onTest} disabled={pending}>Проверить подключение</Button>
        {testResult && (
          <span className={`text-xs ${testResult.ok ? (testResult.warning ? "text-warn-text" : "text-fresh-text") : "text-stamp-text"}`}>
            {testResult.ok
              ? testResult.warning ?? (testResult.clockOffsetSec !== undefined ? `часы: расхождение ${testResult.clockOffsetSec}с` : "подключение есть")
              : testResult.error}
          </span>
        )}
      </div>
      {device.clockOffsetSec !== null && Math.abs(device.clockOffsetSec) > 120 && (
        <p className="text-xs text-warn-text mt-1">
          Часы регистратора сбиты (расхождение {device.clockOffsetSec}с) — архив по датам может не находиться.
        </p>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Каналы ({device.cameras.length}/{device.channelCount})</span>
          <button className="text-xs text-stamp-text hover:underline" onClick={() => setShowCameraForm((v) => !v)}>+ канал</button>
        </div>
        {showCameraForm && (
          <div className="flex items-end gap-2 mb-2">
            <label className="block">
              <span className="block text-xs text-ink-soft mb-0.5">Канал</span>
              <input value={channel} onChange={(e) => setChannel(e.target.value)} inputMode="numeric" className="w-16 h-9 px-2 bg-paper border border-line rounded-tag text-sm" />
            </label>
            <label className="block flex-1">
              <span className="block text-xs text-ink-soft mb-0.5">Название</span>
              <input value={cameraName} onChange={(e) => setCameraName(e.target.value)} placeholder="Касса" className="w-full h-9 px-2 bg-paper border border-line rounded-tag text-sm" />
            </label>
            <Button variant="stamp" size="md" onClick={addCamera} disabled={pending}>Добавить</Button>
          </div>
        )}
        {device.cameras.length === 0 ? (
          <p className="text-xs text-ink-soft">Каналов пока нет.</p>
        ) : (
          <div className="space-y-1">
            {device.cameras.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm py-1">
                <span className={c.enabled ? "" : "text-ink-soft line-through"}>Канал {c.channel} — {c.name}</span>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-ink-soft hover:text-ink" onClick={() => toggleCamera(c)}>{c.enabled ? "выключить" : "включить"}</button>
                  <button className="text-xs text-ink-soft hover:text-stamp-text" onClick={() => removeCamera(c)}>удалить</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function DeviceFormModal({
  storeId, agents, initial, onCancel, onSaved,
}: {
  storeId: string; agents: Agent[]; initial: Device | null; onCancel: () => void; onSaved: (device: Device) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [vendor, setVendor] = useState<CameraVendor>(initial?.vendor ?? "DAHUA");
  const [connection, setConnection] = useState<CameraConnectionMode>(initial?.connection ?? "AGENT");
  const [agentId, setAgentId] = useState(initial?.agentId ?? agents[0]?.id ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  const [rtspPort, setRtspPort] = useState(String(initial?.rtspPort ?? 554));
  const [httpPort, setHttpPort] = useState(String(initial?.httpPort ?? 80));
  const [username, setUsername] = useState(initial?.username ?? "admin");
  const [password, setPassword] = useState("");
  const [channelCount, setChannelCount] = useState(String(initial?.channelCount ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buildRow(id: string): Device {
    return {
      id, name, vendor, connection, agentId: connection === "AGENT" ? agentId : null,
      agentName: agents.find((a) => a.id === agentId)?.name ?? null,
      agentStatus: agents.find((a) => a.id === agentId)?.status ?? null,
      host, rtspPort: parseInt(rtspPort, 10) || 554, httpPort: parseInt(httpPort, 10) || 80,
      username, channelCount: parseInt(channelCount, 10) || 1,
      clockOffsetSec: initial?.clockOffsetSec ?? null, clockCheckedAt: initial?.clockCheckedAt ?? null,
      cameras: initial?.cameras ?? [],
    };
  }

  function save() {
    setError(null);
    const input: DeviceFormInput = {
      name, vendor, connection, agentId: connection === "AGENT" ? agentId : null,
      host, rtspPort: parseInt(rtspPort, 10) || 554, httpPort: parseInt(httpPort, 10) || 80,
      username, password: password || undefined, channelCount: parseInt(channelCount, 10) || 1,
    };
    startTransition(async () => {
      if (initial) {
        const res = await updateDeviceAction(storeId, initial.id, input);
        if (!res.ok) { setError(res.error); return; }
        onSaved(buildRow(initial.id));
      } else {
        const res = await createDeviceAction(storeId, input);
        if (!res.ok) { setError(res.error); return; }
        onSaved(buildRow(res.id));
      }
    });
  }

  return (
    <Modal onCancel={onCancel}>
      <div className="w-[min(92vw,480px)] max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-3">{initial ? "Изменить устройство" : "Новое устройство"}</h2>
        <div className="space-y-3">
          <Field label="Название" value={name} onChange={(e) => setName(e.target.value)} placeholder="Регистратор — склад" />
          <div>
            <span className="block text-sm text-ink-soft mb-1">Вендор</span>
            <SegmentedControl
              fill
              options={[{ value: "DAHUA" as const, label: "Dahua" }, { value: "HIKVISION" as const, label: "Hikvision" }, { value: "GENERIC" as const, label: "Другой" }]}
              value={vendor}
              onChange={setVendor}
            />
          </div>
          <div>
            <span className="block text-sm text-ink-soft mb-1">Подключение</span>
            <SegmentedControl
              fill
              options={[{ value: "AGENT" as const, label: "Через агента" }, { value: "DIRECT" as const, label: "Напрямую (белый IP)" }]}
              value={connection}
              onChange={setConnection}
            />
          </div>
          {connection === "AGENT" && (
            <label className="block">
              <span className="block text-sm text-ink-soft mb-1">Агент</span>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full h-11 px-3 bg-paper border border-line rounded-tag">
                <option value="">— выберите агента —</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          <Field label="Адрес в локальной сети" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.108" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="RTSP-порт" value={rtspPort} onChange={(e) => setRtspPort(e.target.value)} inputMode="numeric" />
            <Field label="HTTP-порт" value={httpPort} onChange={(e) => setHttpPort(e.target.value)} inputMode="numeric" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Логин" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Field label={initial ? "Новый пароль (необязательно)" : "Пароль"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Field label="Количество каналов" value={channelCount} onChange={(e) => setChannelCount(e.target.value)} inputMode="numeric" />
        </div>
        {error && <p className="text-stamp-text text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-4">
          <Button variant="line" size="lg" onClick={onCancel}>Отмена</Button>
          <Button variant="stamp" size="lg" onClick={save} disabled={pending || !name.trim() || !host.trim()}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
