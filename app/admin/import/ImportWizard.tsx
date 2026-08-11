"use client";
import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { Card, Button, SegmentedControl, EmptyState, ConfirmDialog, Badge } from "@/components/ui";
import { IMPORT_PRESETS } from "@/lib/importPresets";
import {
  decodeCsvBuffer, detectHeaderRowIndex, autoMapColumns, applyPreset, parseRow,
  FIELD_LABELS, type ColumnMapping, type FieldKey, type ParsedProductRow,
} from "@/lib/importParser";
import { runWithConcurrency } from "@/lib/concurrency";
import type { Finding, FindingField } from "@/server/ai/importCheck";
import {
  checkExistingBarcodesAction, checkImportBatchAction, startImportBatchAction,
  commitImportChunkAction, rollbackImportAction,
} from "./actions";

const CHUNK_SIZE = 50;
const AI_CONCURRENCY = 3;
const TRIAL_AI_LIMIT = 200;
const FIELD_ORDER: FieldKey[] = ["name", "barcode", "price", "costPrice", "unit", "category", "expiry", "stock"];
const REQUIRED_FIELDS: FieldKey[] = ["name"];

type Step = "upload" | "mapping" | "preview" | "aicheck" | "committing" | "done";
type DedupMode = "skip" | "updatePrice" | "updateAll";

export function ImportWizard({ orgPlan, existingCategories }: { orgPlan: string; existingCategories: string[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [presetId, setPresetId] = useState("custom");
  const [mapping, setMapping] = useState<ColumnMapping>({});

  const [parsed, setParsed] = useState<ParsedProductRow[]>([]);
  const [dedupMode, setDedupMode] = useState<DedupMode>("skip");
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [resolvedFindings, setResolvedFindings] = useState<Set<number>>(new Set());
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiFailedChunks, setAiFailedChunks] = useState(0);
  const [ranAiCheck, setRanAiCheck] = useState(false);

  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ imported: number; updated: number; skipped: number } | null>(null);
  const [rolledBack, setRolledBack] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const headers = rawRows[headerRowIndex] ?? [];
  const dataRows = rawRows.slice(headerRowIndex + 1);

  // ── Шаг 1: загрузка ──────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      let rows: string[][];
      if (/\.csv$/i.test(file.name)) {
        const text = decodeCsvBuffer(buffer);
        rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
      } else {
        const wb = XLSX.read(buffer, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      }
      rows = rows.filter((r) => Array.isArray(r) && r.length > 0);
      if (rows.length === 0) throw new Error("Файл пустой или не удалось прочитать");
      if (rows.length > 20000) throw new Error("Файл слишком большой (больше 20000 строк) — разбейте на части");

      const idx = detectHeaderRowIndex(rows);
      const hdrs = rows[idx] ?? [];
      setFileName(file.name);
      setRawRows(rows);
      setHeaderRowIndex(idx);
      setMapping(autoMapColumns(hdrs));
      setPresetId("custom");
      setStep("mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось прочитать файл");
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Шаг 2-4: строка шапки, пресет, сопоставление колонок ─────────────
  function changeHeaderRow(idx: number) {
    setHeaderRowIndex(idx);
    const hdrs = rawRows[idx] ?? [];
    const preset = IMPORT_PRESETS.find((p) => p.id === presetId);
    setMapping(preset && presetId !== "custom" ? applyPreset(hdrs, preset.columns) : autoMapColumns(hdrs));
  }

  function choosePreset(id: string) {
    setPresetId(id);
    const preset = IMPORT_PRESETS.find((p) => p.id === id);
    setMapping(preset && id !== "custom" ? applyPreset(headers, preset.columns) : autoMapColumns(headers));
  }

  function setFieldColumn(field: FieldKey, colIdx: number | null) {
    setMapping((prev) => {
      const next = { ...prev };
      if (colIdx === null) delete next[field];
      else next[field] = colIdx;
      return next;
    });
  }

  const canProceedToPreview = mapping.name !== undefined;

  function runParse() {
    const seen = new Set<string>();
    const rows = dataRows.map((r) => parseRow(r, mapping, seen));
    setParsed(rows);
    setStep("preview");
    setDuplicateCount(null);
    const barcodes = rows.map((r) => r.barcode).filter((b): b is string => b !== null);
    if (barcodes.length > 0) {
      checkExistingBarcodesAction(barcodes).then((res) => {
        if (res.ok) setDuplicateCount(res.barcodes.length);
      });
    } else {
      setDuplicateCount(0);
    }
  }

  // ── Сводка по разбору ────────────────────────────────────────────────
  const parseStats = useMemo(() => {
    const willImport = parsed.filter((r) => !r.skip).length;
    const noName = parsed.filter((r) => r.skip && r.skipReason === "нет названия").length;
    const subtotal = parsed.filter((r) => r.skip && r.skipReason === "похоже на строку-подытог").length;
    const dupInFile = parsed.filter((r) => r.skip && r.skipReason === "дубль штрихкода внутри файла").length;
    const withIssues = parsed.filter((r) => !r.skip && r.issues.length > 0).length;
    return { willImport, noName, subtotal, dupInFile, withIssues };
  }, [parsed]);

  // ── Шаг 6 (необязательный): проверка ИИ ──────────────────────────────
  const activeRows = useMemo(() => parsed.map((row, index) => ({ index, row })).filter((r) => !r.row.skip), [parsed]);
  const aiCapped = orgPlan === "TRIAL" && activeRows.length > TRIAL_AI_LIMIT;

  async function runAiCheck() {
    setError(null);
    setStep("aicheck");
    setFindings([]);
    setResolvedFindings(new Set());
    setAiFailedChunks(0);

    const capped = orgPlan === "TRIAL" ? activeRows.filter((r) => r.index < TRIAL_AI_LIMIT) : activeRows;
    const chunks: { index: number; row: ParsedProductRow }[][] = [];
    for (let i = 0; i < capped.length; i += CHUNK_SIZE) chunks.push(capped.slice(i, i + CHUNK_SIZE));

    if (chunks.length === 0) {
      setAiProgress({ done: 0, total: 0 });
      setRanAiCheck(true);
      return;
    }

    setAiProgress({ done: 0, total: chunks.length });
    let done = 0;
    let failed = 0;
    const allFindings: Finding[] = [];

    await runWithConcurrency(chunks, AI_CONCURRENCY, async (chunk) => {
      const res = await checkImportBatchAction(chunk, existingCategories);
      done++;
      setAiProgress({ done, total: chunks.length });
      if (res.ok) {
        if (res.failed) failed++;
        else allFindings.push(...res.findings);
      } else {
        failed++;
      }
    });

    setFindings(allFindings);
    setAiFailedChunks(failed);
    setRanAiCheck(true);
  }

  function applyFinding(idx: number) {
    const f = findings[idx];
    const suggested = f.suggested;
    if (suggested === null) return;
    setParsed((prev) => {
      const next = [...prev];
      const row = { ...next[f.row] };
      if (f.field === "price" || f.field === "costPrice") {
        const n = Number(suggested);
        if (Number.isFinite(n)) row[f.field] = n;
      } else if (f.field === "unit") {
        row.unit = suggested === "KG" ? "KG" : "PCS";
      } else if (f.field === "name" || f.field === "category" || f.field === "barcode") {
        row[f.field] = suggested;
      } else if (f.field === "expiry") {
        row.expiry = suggested;
      }
      next[f.row] = row;
      return next;
    });
    setResolvedFindings((prev) => new Set(prev).add(idx));
  }

  function skipFinding(idx: number) {
    setResolvedFindings((prev) => new Set(prev).add(idx));
  }

  function applyGroup(field: FindingField) {
    findings.forEach((f, idx) => {
      if (f.field === field && f.suggested !== null && !resolvedFindings.has(idx)) applyFinding(idx);
    });
  }

  const findingGroups = useMemo(() => {
    const groups = new Map<FindingField, number[]>();
    findings.forEach((f, idx) => {
      const arr = groups.get(f.field) ?? [];
      arr.push(idx);
      groups.set(f.field, arr);
    });
    return groups;
  }, [findings]);

  // ── Шаг 7: запись в базу пачками ──────────────────────────────────────
  async function commitImport() {
    setError(null);
    setStep("committing");

    const startRes = await startImportBatchAction(fileName, parsed.length, ranAiCheck);
    if (!startRes.ok) {
      setError(startRes.error);
      setStep("preview");
      return;
    }
    setBatchId(startRes.batchId);

    const chunks: ParsedProductRow[][] = [];
    for (let i = 0; i < parsed.length; i += CHUNK_SIZE) chunks.push(parsed.slice(i, i + CHUNK_SIZE));
    setCommitProgress({ done: 0, total: chunks.length });

    let imported = 0, updated = 0, skipped = 0;
    for (let i = 0; i < chunks.length; i++) {
      const res = await commitImportChunkAction(startRes.batchId, chunks[i], dedupMode);
      setCommitProgress({ done: i + 1, total: chunks.length });
      if (res.ok) {
        imported += res.imported;
        updated += res.updated;
        skipped += res.skipped;
      } else {
        // Не продолжаем молча — раз один вызов не прошёл (обычно это auth/billing),
        // следующие пачки с той же авторизацией упадут так же. Уже записанное
        // остаётся в базе (batchId уже сохранён выше), оставшиеся строки честно
        // не считаем ни импортированными, ни пропущенными — они не обработаны.
        setError(`Импорт остановлен на пачке ${i + 1} из ${chunks.length}: ${res.error}. Уже добавленное осталось в базе — попробуйте ещё раз или отмените импорт.`);
        break;
      }
    }

    setSummary({ imported, updated, skipped });
    setStep("done");
  }

  async function handleRollback() {
    if (!batchId) return;
    setBusy(true);
    const res = await rollbackImportAction(batchId);
    setBusy(false);
    setConfirmRollback(false);
    if (res.ok) {
      setRolledBack(true);
    } else {
      setError(res.error);
    }
  }

  function reset() {
    setStep("upload");
    setError(null);
    setFileName("");
    setRawRows([]);
    setHeaderRowIndex(0);
    setPresetId("custom");
    setMapping({});
    setParsed([]);
    setDedupMode("skip");
    setDuplicateCount(null);
    setFindings([]);
    setResolvedFindings(new Set());
    setAiProgress(null);
    setAiFailedChunks(0);
    setRanAiCheck(false);
    setCommitProgress(null);
    setBatchId(null);
    setSummary(null);
    setRolledBack(false);
  }

  return (
    <div className="max-w-4xl">
      {error && (
        <div className="bg-stamp/10 border border-stamp/30 text-stamp-text rounded-tag px-4 py-2.5 text-sm mb-4">{error}</div>
      )}

      {step === "upload" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-tag p-10 text-center transition-colors ${dragOver ? "border-ink bg-paper-2" : "border-line"}`}
        >
          <p className="text-ink-soft mb-4">Перетащите файл сюда или выберите вручную — .xlsx, .xls, .csv</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button variant="stamp" size="lg" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? "Читаю…" : "Выбрать файл"}
          </Button>
        </div>
      )}

      {step === "mapping" && (
        <div className="space-y-5">
          <Card>
            <div className="text-sm font-medium mb-2">Первые строки файла «{fileName}»</div>
            <RawPreviewTable rows={rawRows.slice(0, 15)} headerRowIndex={headerRowIndex} />
            <label className="block mt-3 text-sm text-ink-soft">
              Строка с названиями колонок:{" "}
              <select
                value={headerRowIndex}
                onChange={(e) => changeHeaderRow(Number(e.target.value))}
                className="h-9 px-2 bg-paper border border-line rounded-tag text-sm ml-1"
              >
                {rawRows.slice(0, 15).map((_, i) => (
                  <option key={i} value={i}>Строка {i + 1}</option>
                ))}
              </select>
              {" "}(если автоопределение ошиблось — выберите нужную)
            </label>
          </Card>

          <Card>
            <div className="text-sm font-medium mb-2">Откуда файл?</div>
            <SegmentedControl
              options={IMPORT_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
              value={presetId}
              onChange={choosePreset}
            />
            <div className="text-xs text-ink-soft mt-2">{IMPORT_PRESETS.find((p) => p.id === presetId)?.hint}</div>
          </Card>

          <Card>
            <div className="text-sm font-medium mb-3">Сопоставление колонок</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {FIELD_ORDER.map((field) => (
                <label key={field} className="block">
                  <span className="block text-xs text-ink-soft mb-1">
                    {FIELD_LABELS[field]}{REQUIRED_FIELDS.includes(field) ? " *" : ""}
                  </span>
                  <select
                    value={mapping[field] ?? ""}
                    onChange={(e) => setFieldColumn(field, e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full h-9 px-2 bg-paper border border-line rounded-tag text-sm"
                  >
                    <option value="">— не сопоставлено —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Колонка ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button variant="line" size="lg" onClick={reset}>Другой файл</Button>
            <Button variant="stamp" size="lg" disabled={!canProceedToPreview} onClick={runParse}>Далее — предпросмотр</Button>
          </div>
          {!canProceedToPreview && <p className="text-xs text-ink-soft">Сопоставьте хотя бы «Название», чтобы продолжить.</p>}
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-5">
          <Card>
            <div className="text-sm mb-3">
              Будет импортировано: <b>{parseStats.willImport}</b> из {parsed.length}.{" "}
              {parseStats.noName > 0 && `${parseStats.noName} без названия. `}
              {parseStats.subtotal > 0 && `${parseStats.subtotal} похожи на подытог. `}
              {parseStats.dupInFile > 0 && `${parseStats.dupInFile} — дубль штрихкода внутри файла. `}
              {parseStats.withIssues > 0 && `${parseStats.withIssues} с замечаниями (см. предпросмотр).`}
            </div>
            <PreviewTable rows={parsed.slice(0, 15)} />
          </Card>

          {duplicateCount === null && <p className="text-sm text-ink-soft">Проверяю пересечения с базой…</p>}
          {duplicateCount !== null && duplicateCount > 0 && (
            <Card>
              <div className="text-sm font-medium mb-2">
                У {duplicateCount} штрихкодов уже есть карточка в этой точке. Что делать с ними?
              </div>
              <SegmentedControl
                options={[
                  { value: "skip", label: "Пропустить" },
                  { value: "updatePrice", label: "Обновить цену" },
                  { value: "updateAll", label: "Обновить всё" },
                ]}
                value={dedupMode}
                onChange={(v) => setDedupMode(v as DedupMode)}
              />
              <p className="text-xs text-ink-soft mt-2">
                Один выбор на весь импорт. «Обновить всё» не трогает остаток и активность товара — только название/цены/категорию/единицу/срок годности.
              </p>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="line" size="lg" onClick={() => setStep("mapping")}>Назад</Button>
            <Button variant="line" size="lg" onClick={commitImport}>Пропустить проверку — импортировать</Button>
            <Button variant="stamp" size="lg" onClick={runAiCheck}>Проверить ИИ</Button>
          </div>
        </div>
      )}

      {step === "aicheck" && (
        <div className="space-y-5">
          {aiCapped && (
            <div className="bg-warn/10 border border-warn/40 text-warn-text rounded-tag px-4 py-2.5 text-sm">
              На пробном тарифе проверяются только первые {TRIAL_AI_LIMIT} позиций.
            </div>
          )}
          {aiProgress && aiProgress.total > 0 && aiProgress.done < aiProgress.total && (
            <Card>
              <div className="text-sm mb-2">Проверяю пачку {aiProgress.done} из {aiProgress.total}…</div>
              <div className="h-2 bg-paper-2 rounded-full overflow-hidden">
                <div className="h-full bg-ink transition-all" style={{ width: `${(aiProgress.done / aiProgress.total) * 100}%` }} />
              </div>
            </Card>
          )}

          {aiProgress && aiProgress.done >= aiProgress.total && (
            <>
              {aiFailedChunks > 0 && (
                <div className="bg-warn/10 border border-warn/40 text-warn-text rounded-tag px-4 py-2.5 text-sm">
                  {aiFailedChunks} {aiFailedChunks === 1 ? "пачка" : "пачек"} — проверка не удалась. Остальное проверено, импорт можно продолжить.
                </div>
              )}
              {findings.length === 0 ? (
                <EmptyState>Замечаний нет.</EmptyState>
              ) : (
                <div className="space-y-4">
                  {[...findingGroups.entries()].map(([field, idxs]) => {
                    const applicable = idxs.filter((i) => findings[i].suggested !== null && !resolvedFindings.has(i));
                    return (
                      <div key={field}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">{FIELD_LABELS[field]} — {idxs.length}</div>
                          {applicable.length > 1 && (
                            <button className="text-xs text-ink-soft hover:text-stamp-text underline underline-offset-2" onClick={() => applyGroup(field)}>
                              Применить все предложенные ({applicable.length})
                            </button>
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {idxs.map((idx) => (
                            <FindingCard key={idx} finding={findings[idx]} resolved={resolvedFindings.has(idx)} onApply={() => applyFinding(idx)} onSkip={() => skipFinding(idx)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="line" size="lg" onClick={() => setStep("preview")}>Назад</Button>
                <Button variant="stamp" size="lg" onClick={commitImport}>Импортировать</Button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "committing" && (
        <Card>
          <div className="text-sm mb-2">
            {commitProgress ? `Записываю пачку ${commitProgress.done} из ${commitProgress.total}…` : "Начинаю…"}
          </div>
          {commitProgress && (
            <div className="h-2 bg-paper-2 rounded-full overflow-hidden">
              <div className="h-full bg-fresh transition-all" style={{ width: `${(commitProgress.done / commitProgress.total) * 100}%` }} />
            </div>
          )}
        </Card>
      )}

      {step === "done" && summary && (
        <div className="space-y-5">
          <Card>
            <div className="text-lg font-semibold mb-3">{rolledBack ? "Импорт отменён" : "Импорт завершён"}</div>
            {!rolledBack ? (
              <div className="space-y-1 text-sm">
                <div>Добавлено: <b>{summary.imported}</b></div>
                <div>Обновлено: <b>{summary.updated}</b></div>
                <div>Пропущено: <b>{summary.skipped}</b></div>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">
                {summary.imported} добавленных товаров удалены. {summary.updated > 0 && `${summary.updated} обновлённых остались с новыми значениями — откат меняет только добавленное.`}
              </p>
            )}
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="line" size="lg" onClick={reset}>Импортировать ещё файл</Button>
            {!rolledBack && summary.imported > 0 && (
              <Button variant="line" size="lg" onClick={() => setConfirmRollback(true)}>Отменить импорт</Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRollback}
        title="Отменить импорт?"
        body={`Удалит ${summary?.imported ?? 0} добавленных товаров. Обновлённые позиции останутся как есть.`}
        confirmLabel="Отменить импорт"
        busy={busy}
        onConfirm={handleRollback}
        onCancel={() => setConfirmRollback(false)}
      />
    </div>
  );
}

function RawPreviewTable({ rows, headerRowIndex }: { rows: string[][]; headerRowIndex: number }) {
  const maxCols = Math.max(1, ...rows.map((r) => r.length));
  return (
    <div className="overflow-x-auto border border-line rounded-tag">
      <table className="text-xs w-full">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i === headerRowIndex ? "bg-stamp/10 font-medium" : "border-t border-line"}>
              <td className="px-2 py-1 text-ink-soft">{i + 1}</td>
              {Array.from({ length: maxCols }, (_, c) => (
                <td key={c} className="px-2 py-1 whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis">{row[c] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewTable({ rows }: { rows: ParsedProductRow[] }) {
  return (
    <div className="overflow-x-auto border border-line rounded-tag">
      <table className="text-xs w-full">
        <thead>
          <tr className="bg-paper-2 text-ink-soft text-left">
            <th className="px-2 py-1.5 font-medium">Название</th>
            <th className="px-2 py-1.5 font-medium">Штрихкод</th>
            <th className="px-2 py-1.5 font-medium text-right">Цена</th>
            <th className="px-2 py-1.5 font-medium text-right">Закуп</th>
            <th className="px-2 py-1.5 font-medium">Ед.</th>
            <th className="px-2 py-1.5 font-medium">Категория</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-line ${r.skip ? "opacity-40 line-through" : ""}`}>
              <td className="px-2 py-1">{r.name || "—"}</td>
              <td className="px-2 py-1 font-app-mono">{r.barcode ?? "—"}</td>
              <td className="px-2 py-1 text-right font-app-mono">{r.price.toFixed(2)}</td>
              <td className="px-2 py-1 text-right font-app-mono">{r.costPrice.toFixed(2)}</td>
              <td className="px-2 py-1">{r.unit === "KG" ? "кг" : "шт"}</td>
              <td className="px-2 py-1">
                {r.category}
                {r.issues.length > 0 && (
                  <span className="ml-1.5">
                    <Badge tone={r.issues.some((i) => i.severity === "error") ? "stamp" : "warn"}>{r.issues.length}</Badge>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingCard({ finding, resolved, onApply, onSkip }: { finding: Finding; resolved: boolean; onApply: () => void; onSkip: () => void }) {
  return (
    <div className={`relative bg-paper border ${finding.severity === "error" ? "border-stamp" : "border-warn"} rounded-tag overflow-hidden ${resolved ? "opacity-40" : ""}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${finding.severity === "error" ? "bg-stamp" : "bg-warn"}`} aria-hidden />
      <div className="pl-4 pr-3 py-2.5">
        <div className="text-xs text-ink-soft mb-1">Строка {finding.row + 1} · {FIELD_LABELS[finding.field]}</div>
        <div className="text-sm mb-1">{finding.reason}</div>
        <div className="text-xs font-app-mono text-ink-soft">
          {finding.current}
          {finding.suggested !== null && <> → <span className="text-fresh-text">{finding.suggested}</span></>}
        </div>
        {!resolved && (
          <div className="flex gap-2 mt-2">
            {finding.suggested !== null && (
              <button className="text-xs text-fresh-text hover:underline" onClick={onApply}>Применить</button>
            )}
            <button className="text-xs text-ink-soft hover:underline" onClick={onSkip}>Пропустить</button>
          </div>
        )}
      </div>
    </div>
  );
}
