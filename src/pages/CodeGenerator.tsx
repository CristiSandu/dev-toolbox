"use client";

import { useEffect, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import JsBarcode from "jsbarcode";
import QRCodeStyling from "qr-code-styling";

import { Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// -----------------------------
// Code Types
// -----------------------------
type CodeType = "QR Code" | "EAN-13" | "DataMatrix";

const CODE_TYPES: CodeType[] = ["QR Code", "EAN-13", "DataMatrix"];

// -----------------------------
// QR Code (qr-code-styling@next)
// -----------------------------
const createQRCode = (text: string) => {
  const qr = new QRCodeStyling({
    width: 350,
    height: 350,
    type: "svg",
    data: text,
    margin: 4,
    qrOptions: {
      typeNumber: 0,
      mode: "Byte",
      errorCorrectionLevel: "Q",
    },
    dotsOptions: {
      type: "rounded", // Clean preset A
      color: "#000000",
    },
    cornersSquareOptions: {
      type: "rounded",
      color: "#000000",
    },
    backgroundOptions: {
      color: "#FFFFFF",
    },
  });

  return qr;
};

// -----------------------------
// EAN-13 Generator (SVG)
// -----------------------------
const createEan13Svg = (value: string): string => {
  if (!/^\d{12,13}$/.test(value)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">
      <text x="10" y="60" fill="red">Invalid EAN-13</text>
    </svg>`;
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, {
    format: "ean13",
    displayValue: true,
    lineColor: "#000",
    background: "#fff",
  });

  return svg.outerHTML;
};

// -----------------------------
// DataMatrix SVG
// -----------------------------
const createDataMatrixSvg = (value: string): string => {
  return "";
  //   try {
  //     const dm = new DataMatrix({
  //       /* config*/
  //     });
  //     return dm.toSvg(value);
  //   } catch (e) {
  //     return `<svg …><text …>Invalid DataMatrix</text></svg>`;
  //   }
};

// -----------------------------
// Convert SVG → PNG Blob
// -----------------------------
const svgToPng = async (svgString: string): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;

      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, "image/png");

      URL.revokeObjectURL(url);
    };

    img.src = url;
  });
};

// -----------------------------
// Component
// -----------------------------
export default function CodeGenerator() {
  const [singleText, setSingleText] = useState("");
  const [singleType, setSingleType] = useState<CodeType>("QR Code");

  const [singleSvg, setSingleSvg] = useState<string>("");

  // Multi mode
  const [multiText, setMultiText] = useState("");
  const [multiType, setMultiType] = useState<CodeType>("QR Code");

  const [multiResults, setMultiResults] = useState<
    { text: string; svg: string }[]
  >([]);

  const [selectedMulti, setSelectedMulti] = useState<number | null>(null);

  // ---------------------------
  // Generate a single code
  // ---------------------------
  const generateSingle = async () => {
    if (!singleText.trim()) return;

    if (singleType === "QR Code") {
      const qr = createQRCode(singleText);
      const raw = await qr.getRawData("svg");
      setSingleSvg(raw.toString());
    } else if (singleType === "EAN-13") {
      setSingleSvg(createEan13Svg(singleText));
    } else if (singleType === "DataMatrix") {
      setSingleSvg(createDataMatrixSvg(singleText));
    }
  };

  // ---------------------------
  // Generate multi list
  // ---------------------------
  const generateMulti = async () => {
    const lines = multiText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const results: { text: string; svg: string }[] = [];

    for (const item of lines) {
      if (multiType === "QR Code") {
        const qr = createQRCode(item);
        const data = await qr.getRawData("svg");
        results.push({ text: item, svg: data.toString() });
      } else if (multiType === "EAN-13") {
        results.push({ text: item, svg: createEan13Svg(item) });
      } else {
        results.push({ text: item, svg: createDataMatrixSvg(item) });
      }
    }

    setMultiResults(results);
    setSelectedMulti(results.length > 0 ? 0 : null);
  };

  // ---------------------------
  // Copy SVG
  // ---------------------------
  const copySvg = async (svg: string) => {
    await navigator.clipboard.writeText(svg);
  };

  // ---------------------------
  // Download SVG
  // ---------------------------
  const downloadSvg = (svg: string, filename: string) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.svg`;
    a.click();

    URL.revokeObjectURL(url);
  };

  // ---------------------------
  // Download PNG
  // ---------------------------
  const downloadPng = async (svg: string, filename: string) => {
    const blob = await svgToPng(svg);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.png`;
    a.click();

    URL.revokeObjectURL(url);
  };

  //
  // UI SECTION 1 — SINGLE GENERATION (LEFT SIDE)
  //
  const SingleLeftPanel = (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Single Code</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Type */}
        <select
          className="border rounded p-2"
          value={singleType}
          onChange={(e) => setSingleType(e.target.value as CodeType)}
        >
          {CODE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        {/* Text Input */}
        <Input
          placeholder="Text to encode"
          value={singleText}
          onChange={(e) => setSingleText(e.target.value)}
        />

        <Button onClick={generateSingle}>Generate</Button>
      </CardContent>
    </Card>
  );

  //
  // END PART 1
  //

  //
  // UI SECTION 2 — SINGLE PREVIEW (RIGHT SIDE)
  //
  const SingleRightPanel = (
    <Card className="h-full flex flex-col overflow-hidden bg-white">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4 flex-1 overflow-auto">
        {!singleSvg && (
          <p className="text-muted-foreground">No code generated.</p>
        )}

        {singleSvg && (
          <>
            {/* SVG PREVIEW */}
            <div
              className="border bg-white p-4"
              dangerouslySetInnerHTML={{ __html: singleSvg }}
            />

            <p className="text-sm text-muted-foreground">{singleText}</p>

            {/* ACTION BUTTONS */}
            <div className="flex gap-2">
              <Button
                onClick={() => downloadSvg(singleSvg, singleText || "code")}
                className="flex gap-2"
              >
                <Download size={16} /> SVG
              </Button>

              <Button
                onClick={() => downloadPng(singleSvg, singleText || "code")}
                className="flex gap-2"
              >
                <Download size={16} /> PNG
              </Button>

              <Button onClick={() => copySvg(singleSvg)} className="flex gap-2">
                <Copy size={16} /> Copy SVG
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  //
  // UI SECTION 3 — MULTI MODE LEFT PANEL (INPUT + LIST)
  //
  const MultiLeftPanel = (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Multi Generation</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 flex-1 min-h-0">
        {/* Type */}
        <select
          className="border rounded p-2"
          value={multiType}
          onChange={(e) => setMultiType(e.target.value as CodeType)}
        >
          {CODE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        {/* Textarea */}
        <Textarea
          className="min-h-[120px]"
          placeholder="Enter one value per line"
          value={multiText}
          onChange={(e) => setMultiText(e.target.value)}
        />

        <Button onClick={generateMulti}>Generate List</Button>

        {/* LIST OF RESULTS */}
        <div className="border rounded p-2 overflow-auto flex-1 min-h-0 space-y-2">
          {multiResults.length === 0 && (
            <p className="text-muted-foreground">No items generated.</p>
          )}

          {multiResults.map((item, i) => (
            <div
              key={i}
              onClick={() => setSelectedMulti(i)}
              className={cn(
                "p-2 border rounded cursor-pointer bg-white hover:bg-muted transition flex items-center gap-2",
                selectedMulti === i && "bg-muted"
              )}
            >
              <div
                className="w-12 h-12 flex items-center justify-center bg-white"
                dangerouslySetInnerHTML={{ __html: item.svg }}
              />
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  //
  // UI SECTION 4 — MULTI RIGHT PREVIEW
  //
  const MultiRightPanel = (
    <Card className="h-full flex flex-col overflow-hidden bg-white">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4 flex-1 overflow-auto">
        {selectedMulti === null && (
          <p className="text-muted-foreground">Select an item.</p>
        )}

        {selectedMulti !== null && (
          <>
            <div
              className="border bg-white p-4"
              dangerouslySetInnerHTML={{
                __html: multiResults[selectedMulti].svg,
              }}
            />

            <p className="text-sm text-muted-foreground">
              {multiResults[selectedMulti].text}
            </p>

            <div className="flex gap-2">
              <Button
                onClick={() =>
                  downloadSvg(
                    multiResults[selectedMulti].svg,
                    multiResults[selectedMulti].text
                  )
                }
              >
                <Download size={16} /> SVG
              </Button>

              <Button
                onClick={() =>
                  downloadPng(
                    multiResults[selectedMulti].svg,
                    multiResults[selectedMulti].text
                  )
                }
              >
                <Download size={16} /> PNG
              </Button>

              <Button onClick={() => copySvg(multiResults[selectedMulti].svg)}>
                <Copy size={16} /> Copy SVG
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  //
  // FINAL RETURN — FULL PAGE LAYOUT
  //
  return (
    <div className="p-4 h-full w-full md:overflow-hidden overflow-y-auto">
      <Tabs defaultValue="single" className="h-full flex flex-col">
        <TabsList className="w-fit mb-4">
          <TabsTrigger value="single">Single</TabsTrigger>
          <TabsTrigger value="multi">Multi</TabsTrigger>
        </TabsList>

        {/* SINGLE MODE */}
        <TabsContent value="single" className="h-full flex-1">
          <div className="hidden md:block h-full">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={40} minSize={30}>
                <div className="h-full pr-3 overflow-hidden">
                  {SingleLeftPanel}
                </div>
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize={60} minSize={30}>
                <div className="h-full pl-3 overflow-hidden">
                  {SingleRightPanel}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {/* MOBILE */}
          <div className="block md:hidden space-y-4">
            {SingleLeftPanel}
            {SingleRightPanel}
          </div>
        </TabsContent>

        {/* MULTI MODE */}
        <TabsContent value="multi" className="h-full flex-1">
          <div className="hidden md:block h-full">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={45} minSize={30}>
                <div className="h-full pr-3 overflow-hidden">
                  {MultiLeftPanel}
                </div>
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize={55} minSize={30}>
                <div className="h-full pl-3 overflow-hidden">
                  {MultiRightPanel}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {/* MOBILE */}
          <div className="block md:hidden space-y-4">
            {MultiLeftPanel}
            {MultiRightPanel}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
