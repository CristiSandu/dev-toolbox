// src/components/code-generator/CodeGenerator.tsx
"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

import {
  CodeType,
  HistoryPayload,
  MultiInputMode,
} from "@/components/code-generator/codegen-types";
import { SingleCodeTab } from "@/components/code-generator/SingleCodeTab";
import { MultiCodeTab } from "@/components/code-generator/MultiCodeTab";
import { CodegenHistory } from "@/components/code-generator/CodegenHistory";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function CodeGenerator() {
  // Single editor state
  const [singleText, setSingleText] = useState("");
  const [singleType, setSingleType] = useState<CodeType>("EAN-13");

  const [selectedTab, setSelectedTab] = useState<string>("single");

  // Multi editor state
  const [multiText, setMultiText] = useState("");
  const [multiType, setMultiType] = useState<CodeType>("QR Code");
  const [multiMode, setMultiMode] = useState<MultiInputMode>("lines");

  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [generationRefreshToken, setGenerationRefreshToken] = useState(0);

  const [lastSavedMulti, setLastSavedMulti] = useState<HistoryPayload | null>(
    null
  );

  const [lastSavedSingle, setLastSavedSingle] = useState<HistoryPayload | null>(
    null
  );

  // Save to SQLite via Tauri + bump refresh token
  const saveHistoryToDb = async (payload: HistoryPayload) => {
    const source =
      payload.mode === "single"
        ? payload.singleText || ""
        : payload.multiText || "";
    const summary =
      source.length > 60 ? source.slice(0, 57) + "..." : source || "(empty)";

    try {
      await invoke("save_codegen_state", {
        mode: payload.mode,
        summary,
        payload: JSON.stringify(payload),
      });
      setHistoryRefreshToken((t) => t + 1);
    } catch (e) {
      console.error("Failed to save history", e);
      toast("Failed to save history", { description: String(e) });
    }
  };

  // Load a history payload back into editors
  const handleLoadStateFromHistory = (p: HistoryPayload) => {
    if (p.mode === "single") {
      if (p.singleType) setSingleType(p.singleType);
      if (p.singleText !== undefined) setSingleText(p.singleText);
      setLastSavedSingle(p);
      setSelectedTab("single");
      setGenerationRefreshToken((g) => g + 1);
    } else {
      if (p.multiMode) setMultiMode(p.multiMode);
      if (p.multiType) setMultiType(p.multiType);
      if (p.multiText !== undefined) setMultiText(p.multiText);
      setLastSavedMulti(p);
      setSelectedTab("multi");
      setGenerationRefreshToken((g) => g + 1);
    }

    toast("History state loaded into editor");
  };

  return (
    <div className="p-4 h-full w-full md:overflow-hidden overflow-y-auto">
      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="h-full flex flex-col"
      >
        <div className="flex justify-between">
          <TabsList className="w-fit mb-4">
            <TabsTrigger value="single" className="w-[200px]">
              Single
            </TabsTrigger>
            <TabsTrigger value="multi">Multi</TabsTrigger>
          </TabsList>
          <Button
            className={cn(
              "flex gap-2 text-black hover:bg-accent shadow p-0",
              selectedTab === "history" ? "bg-accent" : "bg-transparent"
            )}
            onClick={() => {
              setSelectedTab("history");
            }}
          >
            <History className="h-6 w-6" />
            History
          </Button>
        </div>

        <TabsContent value="single" className="h-full flex-1">
          <SingleCodeTab
            refreshToken={generationRefreshToken}
            singleText={singleText}
            singleType={singleType}
            onChangeText={setSingleText}
            onChangeType={setSingleType}
            onSaveHistory={saveHistoryToDb}
            lastSavedSingle={lastSavedSingle}
            onLastSavedSingle={setLastSavedSingle}
          />
        </TabsContent>

        <TabsContent value="multi" className="h-full flex-1">
          <MultiCodeTab
            refreshToken={generationRefreshToken}
            multiText={multiText}
            multiType={multiType}
            multiMode={multiMode}
            onChangeText={setMultiText}
            onChangeType={setMultiType}
            onChangeMode={setMultiMode}
            onSaveHistory={saveHistoryToDb}
            lastSavedMulti={lastSavedMulti}
            onLastSavedMulti={setLastSavedMulti}
          />
        </TabsContent>

        <TabsContent value="history" className="h-full flex-1">
          <CodegenHistory
            refreshToken={historyRefreshToken}
            onLoadState={handleLoadStateFromHistory}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
