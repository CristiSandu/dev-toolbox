import { useEffect, useRef, useState } from "react";
import { Copy, Download, Search, ListFilter, ArrowDownAZ, ArrowUpAZ, ListOrdered, MoreHorizontal, WandSparkles, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { isTauri } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { EmptyState } from "@/components/workspace";
import { CodePreview } from "./CodePreview";
import { CODE_TYPES, type CodeType, type HistoryPayload, type MultiInputMode } from "./codegen-types";
import { useDraftState } from "@/hooks/use-draft-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { generateCode, svgForCode, type GeneratedCode } from "@/lib/code-generation";
import { parseBatchInput } from "@/lib/code-input";
import { copySvgFromDataUrl, downloadPngFromDataUrl, downloadSvgFromDataUrl, getMultiPlaceholderLines, isSamePayload, MULTI_JSON_PLACEHOLDER } from "@/lib/barcode-utils";

interface Props {
  multiText: string; multiType: CodeType; multiMode: MultiInputMode; lastSavedMulti: HistoryPayload | null; refreshToken: number;
  onChangeText: (value: string) => void; onChangeType: (value: CodeType) => void; onChangeMode: (value: MultiInputMode) => void;
  onSaveHistory: (payload: HistoryPayload) => Promise<boolean>; onLastSavedMulti: (value: HistoryPayload | null) => void;
}
export function MultiCodeTab({ multiText, multiType, multiMode, lastSavedMulti, refreshToken, onChangeText, onChangeType, onChangeMode, onSaveHistory, onLastSavedMulti }: Props) {
  const [results, setResults] = useDraftState<GeneratedCode[]>("code.batchResults", []);
  const [snapshot, setSnapshot] = useDraftState<HistoryPayload | null>("code.batchSnapshot", null);
  const [selectedIndex, setSelectedIndex] = useDraftState<number | null>("code.batchSelected", null);
  const [errors, setErrors] = useDraftState<string[]>("code.batchErrors", []);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"original" | "asc" | "desc">("original");
  const [types, setTypes] = useState<CodeType[]>(CODE_TYPES);
  const mobile = useIsMobile();
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const payload: HistoryPayload = { mode: "multi", multiMode, multiType, multiText };
  const generateMulti = async () => {
    if (!multiText.trim() || running.current) return;
    if (!isTauri()) { setErrors(["Open the desktop app to generate codes locally."]); return; }
    running.current = true; setBusy(true); setErrors([]);
    try {
      const parsed = parseBatchInput(multiText, multiMode, multiType);
      const next: GeneratedCode[] = [], issues = [...parsed.errors];
      for (let index = 0; index < parsed.items.length; index++) {
        if (!mounted.current) return;
        const item = parsed.items[index];
        setProgress(`${index + 1} of ${parsed.items.length}`);
        try { next.push({ ...await generateCode(item.type, item.text), description: item.description }); }
        catch (error) { issues.push(`${multiMode === "lines" ? "Line" : "Item"} ${item.position}: ${String(error)}`); }
      }
      if (!mounted.current) return;
      setErrors(issues);
      if (!next.length) { if (!issues.length) setErrors(["Add at least one nonempty value to generate a batch."]); return; }
      setResults(next); setSnapshot(payload); setSelectedIndex(0); setTypes(CODE_TYPES);
      if (!isSamePayload(lastSavedMulti, payload) && await onSaveHistory(payload)) onLastSavedMulti(payload);
    } catch (error) { if (mounted.current) setErrors([error instanceof Error ? error.message : String(error)]); }
    finally { running.current = false; if (mounted.current) { setBusy(false); setProgress(""); } }
  };
  const generateRef = useRef(generateMulti); generateRef.current = generateMulti;
  useEffect(() => { if (refreshToken > 0) void generateRef.current(); }, [refreshToken]);
  const availableTypes = CODE_TYPES.filter(type => results.some(result => result.type === type));
  const filtered = results.map((result, index) => ({ result, index })).filter(({ result }) => types.includes(result.type) && `${result.text} ${result.type} ${result.description ?? ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sortOrder === "original" ? a.index - b.index : (sortOrder === "asc" ? 1 : -1) * a.result.text.localeCompare(b.result.text));
  const exportCode = async (result: GeneratedCode, format: "svg" | "png" | "copy") => {
    try {
      if (format === "png") await downloadPngFromDataUrl(result.dataUrl, result.text);
      else if (format === "svg") downloadSvgFromDataUrl(await svgForCode(result), result.text);
      else await copySvgFromDataUrl(await svgForCode(result));
    } catch (error) { toast.error("Could not export this code", { description: String(error) }); }
  };
  const source = <section className="pane h-full"><div className="pane-heading"><h2>Batch input</h2>{results.length > 0 && <span className="text-xs text-muted-foreground">{results.length} generated</span>}</div>
    <div className="pane-body flex flex-col gap-4">
      <div className="field-grid"><div className="field"><label id="batch-mode-label">Input format</label><Select value={multiMode} disabled={busy} onValueChange={value => onChangeMode(value as MultiInputMode)}><SelectTrigger aria-labelledby="batch-mode-label"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lines">One per line</SelectItem><SelectItem value="json">JSON</SelectItem></SelectContent></Select></div><div className="field"><label id="batch-type-label">Code format</label>{multiMode === "json" ? <p className="flex h-9 items-center text-sm text-muted-foreground">Set per item</p> : <Select value={multiType} disabled={busy} onValueChange={value => onChangeType(value as CodeType)}><SelectTrigger aria-labelledby="batch-type-label"><SelectValue /></SelectTrigger><SelectContent>{CODE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>}</div></div>
      <div className="field"><label htmlFor="batch-values">Values to encode</label><Textarea id="batch-values" className="h-36 min-h-32 max-h-64 font-mono text-sm" disabled={busy} value={multiText} placeholder={multiMode === "json" ? MULTI_JSON_PLACEHOLDER : getMultiPlaceholderLines(multiType)} onChange={event => onChangeText(event.target.value)} /><p className="field-hint">{multiMode === "json" ? 'Each object needs "text" and "type"; "description" is optional. The code format comes from each object.' : multiType === "EAN-13" ? "One EAN per line: 12 digits to calculate a check digit, or 13 to validate it." : multiType === "Code128" ? "One GS1 payload per line, e.g. (01)09501101530008(10)ABC123." : "One value per line. Each value generates its own code."}</p></div>
      <Button className="self-start" disabled={busy || !multiText.trim()} onClick={() => void generateMulti()}>{busy ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}{busy ? `Generating ${progress}…` : "Generate batch"}</Button>
      {errors.length > 0 && <div role="alert" className="inline-notice error-notice max-h-28 overflow-auto"><ul className="space-y-1">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
    </div>
    {results.length > 0 ? <><div className="result-search"><div className="relative min-w-24 flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search generated codes" className="pl-8" placeholder="Search results…" value={search} onChange={event => setSearch(event.target.value)} /></div><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Filter code formats"><ListFilter /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Code formats</DropdownMenuLabel>{availableTypes.map(type => <DropdownMenuCheckboxItem key={type} checked={types.includes(type)} onCheckedChange={checked => setTypes(current => checked ? [...current, type] : current.filter(item => item !== type))}>{type}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu><Button size="icon" variant="ghost" aria-label={`Result order: ${sortOrder}. Change order`} onClick={() => setSortOrder(sortOrder === "original" ? "asc" : sortOrder === "asc" ? "desc" : "original")}>{sortOrder === "original" ? <ListOrdered /> : sortOrder === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ />}</Button></div>
      <div className="code-results" aria-label="Generated codes">{filtered.length ? filtered.map(({ result, index }) => <div key={index} className={`code-result${selectedIndex === index ? " is-selected" : ""}`}><button type="button" className="code-result-select" aria-pressed={selectedIndex === index} onClick={() => setSelectedIndex(index)}><span className="code-thumbnail"><img src={result.dataUrl} alt="" /></span><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate font-mono text-sm">{result.text}</span><span className="truncate text-xs text-muted-foreground">{result.type}{result.description ? ` · ${result.description}` : ""}</span></span></button><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Actions for ${result.text}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void exportCode(result, "svg")}><Download />Download SVG</DropdownMenuItem><DropdownMenuItem onClick={() => void exportCode(result, "png")}><Download />Download PNG</DropdownMenuItem><DropdownMenuItem onClick={() => void exportCode(result, "copy")}><Copy />Copy SVG</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>) : <EmptyState title="No matching codes" description="Try another search or change the code format filters." />}</div></> : <div className="pane-footer">Successful generations are saved in local history. Individual errors stay with this batch.</div>}
  </section>;
  return <ResizablePanelGroup key={mobile ? "vertical" : "horizontal"} direction={mobile ? "vertical" : "horizontal"} className={mobile ? "min-h-[1150px]" : "h-full"}>
    <ResizablePanel defaultSize={mobile ? 62 : 43} minSize={30}><div className={mobile ? "h-full pb-2" : "h-full pr-2"}>{source}</div></ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize={mobile ? 38 : 57} minSize={30}><div className={mobile ? "h-full pt-2" : "h-full pl-2"}><CodePreview result={selectedIndex === null ? null : results[selectedIndex] ?? null} busy={busy} stale={!!snapshot && !isSamePayload(snapshot, payload)} /></div></ResizablePanel>
  </ResizablePanelGroup>;
}
