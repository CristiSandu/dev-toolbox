import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { QrCode, Layers, History } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkspaceHeading } from "@/components/workspace";
import type { CodeType, HistoryPayload, MultiInputMode } from "@/components/code-generator/codegen-types";
import { SingleCodeTab } from "@/components/code-generator/SingleCodeTab";
import { MultiCodeTab } from "@/components/code-generator/MultiCodeTab";
import { CodegenHistory } from "@/components/code-generator/CodegenHistory";
import { useDraftState } from "@/hooks/use-draft-state";
import { confirmAction } from "@/lib/confirm-action";
import { isSamePayload } from "@/lib/barcode-utils";
import { codeHistorySummary } from "@/lib/code-input";

export default function CodeGenerator() {
  const [singleText, setSingleText] = useDraftState("code.singleText", "");
  const [singleType, setSingleType] = useDraftState<CodeType>("code.singleType", "EAN-13");
  const [multiText, setMultiText] = useDraftState("code.multiText", "");
  const [multiType, setMultiType] = useDraftState<CodeType>("code.multiType", "QR Code");
  const [multiMode, setMultiMode] = useDraftState<MultiInputMode>("code.multiMode", "lines");
  const [tab, setTab] = useDraftState("code.tab", "single");
  const [lastSavedSingle, setLastSavedSingle] = useDraftState<HistoryPayload | null>("code.lastSavedSingle", null);
  const [lastSavedMulti, setLastSavedMulti] = useDraftState<HistoryPayload | null>("code.lastSavedMulti", null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [singleRefresh, setSingleRefresh] = useState(0);
  const [multiRefresh, setMultiRefresh] = useState(0);
  const [params, setParams] = useSearchParams();
  const entryId = params.get("entry");
  useEffect(() => { if (entryId) setTab("history"); }, [entryId, setTab]);
  const saveHistory = async (payload: HistoryPayload) => {
    const source = codeHistorySummary(payload);
    const summary = source.length > 80 ? source.slice(0, 77) + "…" : source;
    try {
      await invoke("save_codegen_state", { mode: payload.mode, summary, payload: JSON.stringify(payload) });
      setHistoryRefresh(value => value + 1); return true;
    } catch (error) { toast.error("Code generated, but history could not be saved.", { description: String(error) }); return false; }
  };
  const restore = async (payload: HistoryPayload) => {
    const current: HistoryPayload = payload.mode === "single" ? { mode: "single", singleText, singleType } : { mode: "multi", multiText, multiType, multiMode };
    const hasDraft = !!(payload.mode === "single" ? singleText.trim() : multiText.trim());
    if (hasDraft && !isSamePayload(current, payload) && !await confirmAction("Replace this code draft with the selected history entry?")) return;
    if (payload.mode === "single") {
      setSingleText(payload.singleText ?? ""); setSingleType(payload.singleType ?? "QR Code"); setLastSavedSingle(payload); setTab("single"); setSingleRefresh(value => value + 1);
    } else {
      setMultiText(payload.multiText ?? ""); setMultiType(payload.multiType ?? "QR Code"); setMultiMode(payload.multiMode ?? "lines"); setLastSavedMulti(payload); setTab("multi"); setMultiRefresh(value => value + 1);
    }
    if (params.has("entry")) setParams({}, { replace: true });
    toast.success("History entry loaded");
  };
  return <div className="tool-page"><WorkspaceHeading title="Barcodes & QR" description="Generate, inspect, and export codes without leaving your workspace." />
    <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-4">
      <TabsList aria-label="Code workspace"><TabsTrigger value="single"><QrCode />Single</TabsTrigger><TabsTrigger value="multi"><Layers />Batch</TabsTrigger><TabsTrigger value="history"><History />History</TabsTrigger></TabsList>
      <TabsContent forceMount value="single" className="min-h-0 data-[state=inactive]:hidden"><SingleCodeTab refreshToken={singleRefresh} singleText={singleText} singleType={singleType} onChangeText={setSingleText} onChangeType={setSingleType} onSaveHistory={saveHistory} lastSavedSingle={lastSavedSingle} onLastSavedSingle={setLastSavedSingle} /></TabsContent>
      <TabsContent forceMount value="multi" className="min-h-0 data-[state=inactive]:hidden"><MultiCodeTab refreshToken={multiRefresh} multiText={multiText} multiType={multiType} multiMode={multiMode} onChangeText={setMultiText} onChangeType={setMultiType} onChangeMode={setMultiMode} onSaveHistory={saveHistory} lastSavedMulti={lastSavedMulti} onLastSavedMulti={setLastSavedMulti} /></TabsContent>
      <TabsContent value="history" className="min-h-0"><CodegenHistory refreshToken={historyRefresh} onLoadState={payload => void restore(payload)} initialSelectedId={entryId ? Number(entryId) : undefined} /></TabsContent>
    </Tabs>
  </div>;
}
