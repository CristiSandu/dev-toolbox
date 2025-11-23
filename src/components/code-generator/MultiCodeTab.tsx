// src/components/code-generator/MultiCodeTab.tsx
"use client";

import { useState } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  CODE_TYPES,
  CodeType,
  HistoryPayload,
  MultiInputMode,
} from "@/components/code-generator/codegen-types";
import {
  copySvgFromDataUrl,
  downloadPngFromDataUrl,
  downloadSvgFromDataUrl,
  getImageStyleForType,
  getMultiPlaceholderLines,
  isSamePayload,
  MULTI_JSON_PLACEHOLDER,
  normalizeType,
} from "@/lib/barcode-utils";

interface MultiCodeTabProps {
  multiText: string;
  multiType: CodeType;
  multiMode: MultiInputMode;
  lastSavedMulti: HistoryPayload | null;
  onChangeText: (value: string) => void;
  onChangeType: (value: CodeType) => void;
  onChangeMode: (value: MultiInputMode) => void;
  onSaveHistory: (payload: HistoryPayload) => Promise<void>;
  onLastSavedMulti: (value: HistoryPayload | null) => void;
}

interface MultiResult {
  text: string;
  dataUrl: string;
  type: CodeType;
}

export function MultiCodeTab(props: MultiCodeTabProps) {
  const {
    multiText,
    multiType,
    multiMode,
    lastSavedMulti,
    onChangeText,
    onChangeType,
    onChangeMode,
    onSaveHistory,
    onLastSavedMulti,
  } = props;

  const [results, setResults] = useState<MultiResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewScale, setPreviewScale] = useState(1);

  const generateMulti = async () => {
    if (!multiText.trim()) {
      setResults([]);
      setSelectedIndex(null);
      return;
    }

    const newResults: MultiResult[] = [];

    try {
      if (multiMode === "lines") {
        const lines = multiText
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          setResults([]);
          setSelectedIndex(null);
          return;
        }

        for (const item of lines) {
          const dataUrl = await invoke<string>("generate_barcode", {
            kind: CODE_TYPES.includes(multiType)
              ? normalizeType(multiType)?.kind ?? "qr"
              : "qr",
            data: item,
            format: "svg",
          });

          newResults.push({ text: item, dataUrl, type: multiType });
        }
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(multiText);
        } catch (e) {
          toast("Invalid JSON", { description: String(e) });
          return;
        }

        if (!Array.isArray(parsed)) {
          toast("JSON must be an array of objects");
          return;
        }

        if (parsed.length === 0) {
          toast("JSON array is empty");
          setResults([]);
          setSelectedIndex(null);
          return;
        }

        for (const entry of parsed) {
          if (!entry || typeof entry !== "object") continue;

          const anyEntry = entry as { text?: unknown; type?: unknown };
          const text = String(anyEntry.text ?? "").trim();
          const typeRaw = String(anyEntry.type ?? "").trim();

          if (!text || !typeRaw) continue;

          const normalized = normalizeType(typeRaw);
          if (!normalized) {
            toast(`Unknown code type "${typeRaw}" – skipping entry.`);
            continue;
          }

          const dataUrl = await invoke<string>("generate_barcode", {
            kind: normalized.kind,
            data: text,
            format: "svg",
          });

          newResults.push({
            text,
            dataUrl,
            type: normalized.uiType,
          });
        }
      }
    } catch (e) {
      toast("Error while generating barcodes", { description: String(e) });
      return;
    }

    setResults(newResults);
    setSelectedIndex(newResults.length > 0 ? 0 : null);

    const payload: HistoryPayload = {
      mode: "multi",
      multiMode,
      multiType,
      multiText,
    };

    // ❗ Only save if different from last saved multi payload
    if (!isSamePayload(lastSavedMulti, payload)) {
      await onSaveHistory(payload);
      onLastSavedMulti(payload);
    }
  };

  const Left = (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Multi Generation</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">Input mode:</span>
          <select
            value={multiMode}
            onChange={(e) => onChangeMode(e.target.value as MultiInputMode)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="lines">Lines</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <select
          className={cn(
            "border rounded p-2 text-sm",
            multiMode === "json" && "opacity-50 cursor-not-allowed"
          )}
          value={multiType}
          onChange={(e) => onChangeType(e.target.value as CodeType)}
          disabled={multiMode === "json"}
        >
          {CODE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <Textarea
          className="min-h-[140px] font-mono text-xs"
          placeholder={
            multiMode === "json"
              ? MULTI_JSON_PLACEHOLDER
              : getMultiPlaceholderLines(multiType)
          }
          value={multiText}
          onChange={(e) => onChangeText(e.target.value)}
        />

        <Button onClick={generateMulti}>Generate List</Button>

        {multiMode === "lines" && multiType === "Ean128" && (
          <p className="text-xs text-muted-foreground">
            Each line should be a GS1 string: e.g.
            <br />
            <code>(01)09501101530008(10)ABC123</code>
          </p>
        )}

        {multiMode === "json" && (
          <p className="text-xs text-muted-foreground">
            JSON format: array of {"{"}
            text, type
            {"}"} objects. Type can be:
            <code>"QR Code"</code>, <code>"EAN-13"</code>,{" "}
            <code>"DataMatrix"</code>, <code>"Ean128"</code> or backend values{" "}
            <code>"qr"</code>, <code>"ean13"</code>, <code>"datamatrix"</code>,{" "}
            <code>"ean128"</code>.
          </p>
        )}

        <div className="border rounded p-2 overflow-auto flex-1 min-h-0 space-y-2">
          {results.length === 0 && (
            <p className="text-muted-foreground">No items generated.</p>
          )}

          {results.map((item, i) => (
            <div
              key={i}
              onClick={() => setSelectedIndex(i)}
              className={cn(
                "p-2 border rounded cursor-pointer bg-white hover:bg-muted transition flex items-center gap-2",
                selectedIndex === i && "bg-muted"
              )}
            >
              <div className="w-12 h-12 flex items-center justify-center bg-white">
                <img
                  src={item.dataUrl}
                  alt=""
                  style={{
                    imageRendering: "pixelated",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
              <div className="flex flex-col">
                <span className="truncate text-xs font-mono">{item.text}</span>
                <span className="text-[10px] text-muted-foreground">
                  {item.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const Right = (
    <Card className="h-full flex flex-col overflow-hidden bg-white">
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>Preview</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Size</span>
          <input
            type="range"
            min={50}
            max={300}
            value={previewScale * 100}
            onChange={(e) => setPreviewScale(Number(e.target.value) / 100)}
            className="w-32"
          />
          <span className="text-xs text-muted-foreground">
            {Math.round(previewScale * 100)}%
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4 flex-1 overflow-auto">
        {selectedIndex === null && (
          <p className="text-muted-foreground">Select an item.</p>
        )}

        {selectedIndex !== null && results[selectedIndex] && (
          <>
            <div className="border bg-white p-4">
              <img
                src={results[selectedIndex].dataUrl}
                alt="Generated code"
                style={getImageStyleForType(
                  results[selectedIndex].type,
                  previewScale
                )}
              />
            </div>

            <p className="text-sm text-muted-foreground break-all text-center">
              {results[selectedIndex].text}
            </p>

            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                onClick={() =>
                  downloadSvgFromDataUrl(
                    results[selectedIndex].dataUrl,
                    results[selectedIndex].text
                  )
                }
              >
                <Download size={16} /> SVG
              </Button>

              <Button
                onClick={() =>
                  downloadPngFromDataUrl(
                    results[selectedIndex].dataUrl,
                    results[selectedIndex].text
                  )
                }
              >
                <Download size={16} /> PNG
              </Button>

              <Button
                onClick={() =>
                  copySvgFromDataUrl(results[selectedIndex].dataUrl)
                }
              >
                <Copy size={16} /> Copy SVG
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="hidden md:block h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={45} minSize={30}>
            <div className="h-full pr-3 overflow-hidden">{Left}</div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={55} minSize={30}>
            <div className="h-full pl-3 overflow-hidden">{Right}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="block md:hidden space-y-4">
        {Left}
        {Right}
      </div>
    </>
  );
}
