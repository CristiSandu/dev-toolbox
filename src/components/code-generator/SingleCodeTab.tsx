import { useEffect, useRef } from "react";
import { WandSparkles, LoaderCircle } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBarcode } from "@/hooks/use-barcode";
import { useIsMobile } from "@/hooks/use-mobile";
import { CODE_TYPES, type CodeType, type HistoryPayload } from "./codegen-types";
import { getSinglePlaceholder, isSamePayload } from "@/lib/barcode-utils";
import { CodePreview } from "./CodePreview";

interface Props {
  singleText: string; singleType: CodeType; lastSavedSingle: HistoryPayload | null; refreshToken: number;
  onChangeText: (value: string) => void; onChangeType: (value: CodeType) => void;
  onSaveHistory: (payload: HistoryPayload) => Promise<boolean>; onLastSavedSingle: (value: HistoryPayload | null) => void;
}
export function SingleCodeTab({ singleText, singleType, lastSavedSingle, refreshToken, onChangeText, onChangeType, onSaveHistory, onLastSavedSingle }: Props) {
  const { result, error, busy, generate } = useBarcode();
  const mobile = useIsMobile();
  const generateSingle = async () => {
    if (!singleText.trim() || busy) return;
    const payload: HistoryPayload = { mode: "single", singleType, singleText };
    const generated = await generate(singleType, singleText);
    if (generated && !isSamePayload(lastSavedSingle, payload) && await onSaveHistory(payload)) onLastSavedSingle(payload);
  };
  const generateRef = useRef(generateSingle); generateRef.current = generateSingle;
  useEffect(() => { if (refreshToken > 0) void generateRef.current(); }, [refreshToken]);
  const source = <section className="pane h-full"><div className="pane-heading"><h2>Code details</h2><span className="text-xs text-muted-foreground">Single code</span></div><div className="pane-body flex flex-col gap-5">
    <div className="field"><label id="single-type-label">Code format</label><Select value={singleType} disabled={busy} onValueChange={value => onChangeType(value as CodeType)}><SelectTrigger aria-labelledby="single-type-label"><SelectValue /></SelectTrigger><SelectContent>{CODE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
    <div className="field"><label htmlFor="single-code-text">Value to encode</label><Textarea id="single-code-text" className="h-40 min-h-40 max-h-64 font-mono text-sm" placeholder={getSinglePlaceholder(singleType)} value={singleText} disabled={busy} onChange={event => onChangeText(event.target.value)} /><p className="field-hint text-right tabular-nums">{singleText.length.toLocaleString()} characters</p></div>
    <p className="field-hint">{singleType === "EAN-13" ? "Enter 12 digits to calculate the check digit, or 13 digits to validate an existing EAN." : singleType === "Code128" ? "Use a GS1 payload, for example (01)09501101530008(10)ABC123." : singleType === "QR Code" ? "Encode a URL or text. Generated images can be copied or exported as SVG or PNG." : "Encode text or a GS1 payload in a compact DataMatrix code."}</p>
    {error && <p role="alert" className="inline-notice error-notice">{error}</p>}
    <Button className="self-start" onClick={() => void generateSingle()} disabled={!singleText.trim() || busy}>{busy ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}{busy ? "Generating…" : "Generate code"}</Button>
  </div><div className="pane-footer">Successful generations are saved in local history.</div></section>;
  return <ResizablePanelGroup key={mobile ? "vertical" : "horizontal"} direction={mobile ? "vertical" : "horizontal"} className={mobile ? "min-h-[1000px]" : "h-full"}>
    <ResizablePanel defaultSize={mobile ? 58 : 38} minSize={28}><div className={mobile ? "h-full pb-2" : "h-full pr-2"}>{source}</div></ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize={mobile ? 42 : 62} minSize={30}><div className={mobile ? "h-full pt-2" : "h-full pl-2"}><CodePreview result={result} busy={busy} stale={!!result && (result.text !== singleText || result.type !== singleType)} /></div></ResizablePanel>
  </ResizablePanelGroup>;
}
