import { useCallback, useEffect, useRef, useState } from "react";
import { History, RefreshCw, Trash2, Download, Upload, Search, RotateCcw } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/workspace";
import { useDraftState } from "@/hooks/use-draft-state";
import { codeHistorySummary, parseBatchInput, parseCodeHistory } from "@/lib/code-input";
import { historyDate, type CodeHistoryRow } from "@/lib/history";
import { confirmAction } from "@/lib/confirm-action";
import type { HistoryPayload } from "./codegen-types";

interface Props { refreshToken: number; onLoadState: (payload: HistoryPayload) => void; initialSelectedId?: number }
export function CodegenHistory({ refreshToken, onLoadState, initialSelectedId }: Props) {
  const [entries, setEntries] = useState<CodeHistoryRow[]>([]);
  const [selectedId, setSelectedId] = useDraftState<number | null>("code.historySelected", null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requested = useRef<number | undefined>(undefined);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    if (!isTauri()) { setLoading(false); return; }
    try { setEntries(await invoke<CodeHistoryRow[]>("get_codegen_history")); }
    catch { setError("Could not load code history. Try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refreshToken, refresh]);
  useEffect(() => {
    if (loading || error || !initialSelectedId || requested.current === initialSelectedId) return;
    requested.current = initialSelectedId;
    if (entries.some(entry => entry.id === initialSelectedId)) setSelectedId(initialSelectedId);
    else if (isTauri()) toast.error("This history entry is no longer available.");
  }, [entries, initialSelectedId, loading, error, setSelectedId]);
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0] ?? null;
  const payload = selected ? parseCodeHistory(selected.payload) : null;
  const remove = async (entry: CodeHistoryRow) => {
    if (!await confirmAction("Permanently delete this code history entry? This cannot be undone.", "Delete history entry?")) return;
    try { await invoke("delete_codegen_entry", { id: entry.id }); setEntries(current => current.filter(item => item.id !== entry.id)); if (selectedId === entry.id) setSelectedId(null); toast.success("History entry deleted"); }
    catch (error) { toast.error("Could not delete this entry", { description: String(error) }); }
  };
  const backup = async (mode: "import" | "export") => {
    try {
      const filters = [{ name: "JSON", extensions: ["json"] }];
      const filePath = mode === "export" ? await save({ filters, defaultPath: `codegen-history-${new Date().toISOString().split("T")[0]}.json` }) : await open({ filters, multiple: false });
      if (!filePath) return;
      if (mode === "export") { await invoke("export_codegen_history", { filePath }); toast.success("Code history exported"); }
      else { const count = await invoke<number>("import_codegen_history", { filePath }); toast.success(`Imported ${count} entries`); await refresh(); }
    } catch (error) { toast.error(`Could not ${mode} code history`, { description: String(error) }); }
  };
  const filtered = entries.filter(entry => `${entry.summary} ${entry.payload}`.toLowerCase().includes(search.toLowerCase()));
  let batchValues: { text: string; type: string }[] = [];
  if (payload?.mode === "multi") { try { batchValues = parseBatchInput(payload.multiText ?? "", payload.multiMode ?? "lines", payload.multiType ?? "QR Code").items; } catch { /* The original input remains in JSON details. */ } }
  let detail = selected?.payload ?? "";
  try { detail = JSON.stringify(JSON.parse(detail), null, 2); } catch { /* Preserve unreadable records for inspection and backup. */ }
  return <div className="pane h-full"><div className="pane-heading"><h2>Code history</h2><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={!isTauri() || !entries.length} onClick={() => void backup("export")}><Download />Export</Button><Button size="sm" variant="ghost" disabled={!isTauri()} onClick={() => void backup("import")}><Upload />Import</Button><Button variant="ghost" size="icon-sm" disabled={loading} aria-label="Refresh code history" onClick={() => void refresh()}><RefreshCw /></Button></div></div>
    <div className="history-workspace min-h-0 flex-1"><section className="pane" aria-label="Saved code generations"><div className="history-tools"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search code history" placeholder="Search history…" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} /></div></div><div className="history-items">
      {loading ? <p className="history-message" role="status">Loading code history…</p> : error ? <div role="alert" className="history-message">{error}<Button variant="link" onClick={() => void refresh()}>Retry</Button></div> : filtered.length ? filtered.map(entry => { const data = parseCodeHistory(entry.payload); return <div key={entry.id} className={`history-item${selected?.id === entry.id ? " is-selected" : ""}`}><button type="button" className="history-select" aria-pressed={selected?.id === entry.id} onClick={() => setSelectedId(entry.id)}><small>{entry.mode === "multi" ? "Batch" : data?.singleType ?? "Single code"}</small><strong>{codeHistorySummary(data, entry.summary || "Untitled generation")}</strong><small>{historyDate(entry.created_at)}</small></button><Button size="icon-sm" variant="ghost" aria-label={`Delete history entry ${entry.id}`} onClick={() => void remove(entry)}><Trash2 className="size-3.5" /></Button></div>; }) : <EmptyState icon={History} title={search ? "No matching entries" : "No code history yet"} description={search ? "Try another value or code format." : "Generate a code or batch to save it here automatically."} />}
    </div></section><section className="history-detail" aria-label="History entry details">{selected ? <div className="space-y-6"><div className="space-y-3"><h2 className="break-words text-xl font-semibold tracking-tight">{codeHistorySummary(payload, selected.summary || "Saved generation")}</h2><p className="text-sm text-muted-foreground">{historyDate(selected.created_at)}</p><Button disabled={!payload} onClick={() => { if (payload) onLoadState(payload); }}><RotateCcw />Use again</Button></div>
      {payload ? <div className="space-y-2"><h3 className="text-sm font-medium">{payload.mode === "single" ? "Encoded value" : "Batch input"}</h3>{payload.mode === "single" ? <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-muted-foreground">{payload.singleText}</p> : <><ul className="divide-y divide-border">{batchValues.slice(0, 10).map((value, index) => <li key={index} className="py-3"><p className="break-words font-mono text-sm">{value.text}</p><p className="mt-1 text-xs text-muted-foreground">{value.type}</p></li>)}</ul>{batchValues.length > 10 && <p className="field-hint">{batchValues.length - 10} more inputs in JSON details.</p>}</>}</div> : <p className="inline-notice">This entry has an unsupported or unreadable payload. You can inspect or export the original record.</p>}
      <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">JSON details</summary><pre className="mt-3">{detail}</pre></details>
    </div> : <EmptyState icon={History} title="A little history goes a long way" description="Select a saved generation to inspect its input or use it again." />}</section></div>
  </div>;
}
