// src/components/code-generator/SingleCodeTab.tsx
"use client";

import { useState } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Download } from "lucide-react";
import { useBarcode } from "@/hooks/use-barcode";
import {
  CODE_TYPES,
  CODE_TYPE_TO_KIND,
  CodeKind,
  CodeType,
  HistoryPayload,
} from "@/components/code-generator/codegen-types";
import {
  copySvgFromDataUrl,
  downloadPngFromDataUrl,
  downloadSvgFromDataUrl,
  getImageStyleForType,
  getSinglePlaceholder,
  isSamePayload,
} from "@/lib/barcode-utils";

interface SingleCodeTabProps {
  singleText: string;
  singleType: CodeType;
  lastSavedSingle: HistoryPayload | null;
  onChangeText: (value: string) => void;
  onChangeType: (value: CodeType) => void;
  onSaveHistory: (payload: HistoryPayload) => Promise<void>;
  onLastSavedSingle: (value: HistoryPayload | null) => void;
}

export function SingleCodeTab(props: SingleCodeTabProps) {
  const {
    singleText,
    singleType,
    lastSavedSingle,
    onChangeText,
    onChangeType,
    onSaveHistory,
    onLastSavedSingle,
  } = props;

  const {
    src: singleSrc,
    error: singleError,
    generate: generateSingleBarcode,
  } = useBarcode();

  const [previewScale, setPreviewScale] = useState(1); // per-tab slider

  const generateSingle = async () => {
    if (!singleText.trim()) return;

    const kind = CODE_TYPE_TO_KIND[singleType];
    generateSingleBarcode(kind as CodeKind, singleText, "svg");

    const payload: HistoryPayload = {
      mode: "single",
      singleType,
      singleText,
    };

    // ❗ Only save if different from last saved single payload
    if (!isSamePayload(lastSavedSingle, payload)) {
      await onSaveHistory(payload);
      onLastSavedSingle(payload);
    }
  };

  const Left = (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Single Code</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <select
          className="border rounded p-2"
          value={singleType}
          onChange={(e) => onChangeType(e.target.value as CodeType)}
        >
          {CODE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <Input
          placeholder={getSinglePlaceholder(singleType)}
          value={singleText}
          onChange={(e) => onChangeText(e.target.value)}
        />

        <Button onClick={generateSingle}>Generate</Button>

        {singleError && (
          <p className="text-sm text-red-500 mt-2">
            Error: {singleError.toString()}
          </p>
        )}

        {singleType === "Ean128" && (
          <p className="text-xs text-muted-foreground">
            Format: GS1 AIs like <code>(01)</code>, <code>(10)</code>, etc.
            Example: <code>(01)09501101530008(10)ABC123</code>
          </p>
        )}

        {singleType === "EAN-13" && (
          <p className="text-xs text-muted-foreground">
            Must be a 13-digit numeric EAN (with check digit).
          </p>
        )}
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
        {!singleSrc && (
          <p className="text-muted-foreground">No code generated.</p>
        )}

        {singleSrc && (
          <>
            <div className="border bg-white p-4">
              <img
                src={singleSrc}
                alt="Generated code"
                style={getImageStyleForType(singleType, previewScale)}
              />
            </div>

            <p className="text-sm text-muted-foreground break-all text-center">
              {singleText}
            </p>

            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                onClick={() =>
                  downloadSvgFromDataUrl(singleSrc, singleText || "code")
                }
                className="flex gap-2"
              >
                <Download size={16} /> SVG
              </Button>

              <Button
                onClick={() =>
                  downloadPngFromDataUrl(singleSrc, singleText || "code")
                }
                className="flex gap-2"
              >
                <Download size={16} /> PNG
              </Button>

              <Button
                onClick={() => copySvgFromDataUrl(singleSrc)}
                className="flex gap-2"
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
      {/* Desktop: resizable split */}
      <div className="hidden md:block h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={40} minSize={30}>
            <div className="h-full pr-3 overflow-hidden">{Left}</div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-full pl-3 overflow-hidden">{Right}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: stacked */}
      <div className="block md:hidden space-y-4">
        {Left}
        {Right}
      </div>
    </>
  );
}
