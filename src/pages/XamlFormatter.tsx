"use client";

import { useState, useEffect } from "react";
import AceEditor from "react-ace";
import vkbeautify from "vkbeautify";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import "ace-builds/src-noconflict/mode-xml";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/ext-searchbox";

export default function XamlFormatter() {
  const [input, setInput] = useState<string>("");
  const [output, setOutput] = useState<string>("");

  const format = () => {
    try {
      const pretty = vkbeautify.xml(input);
      setOutput(pretty);
    } catch (err) {
      setOutput(`❌ Error formatting XAML: ${String(err)}`);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+F => Format
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        format();
      }

      // Ctrl+F => Ace Editor search
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        const searchBox = document.querySelector(".ace_searchbtn");
        if (searchBox) (searchBox as HTMLElement).click();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [input]);

  // Layout: Desktop split-view, Mobile stacked
  const EditorLeft = (
    <Card className="h-[60vh] md:h-full flex flex-col overflow-hidden">
      <CardHeader className="h-12 flex items-center justify-between py-2">
        <CardTitle>Input XAML</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
        <AceEditor
          mode="xml"
          theme="monokai"
          value={input}
          onChange={setInput}
          width="100%"
          height="100%"
          style={{ flex: 1 }}
          fontSize={14}
          setOptions={{
            useWorker: false,
            showGutter: true,
            showPrintMargin: false,
          }}
        />
      </CardContent>
    </Card>
  );

  const EditorRight = (
    <Card className="h-[60vh] md:h-full flex flex-col overflow-hidden">
      <CardHeader className="h-12 flex items-center justify-between py-2">
        <CardTitle>Formatted Output</CardTitle>
        <Button onClick={format}>Format</Button>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
        <AceEditor
          mode="xml"
          theme="monokai"
          value={output}
          readOnly
          width="100%"
          height="100%"
          style={{ flex: 1 }}
          fontSize={14}
          setOptions={{
            useWorker: false,
            showGutter: true,
            showPrintMargin: false,
            readOnly: true,
          }}
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="h-full w-full md:overflow-hidden overflow-y-auto">
      {/* DESKTOP MODE — Resizable */}
      <div className="hidden md:block h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full pr-3 overflow-hidden">{EditorLeft}</div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full pl-3 overflow-hidden">{EditorRight}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* MOBILE — stacked */}
      <div className="block md:hidden space-y-4">
        {EditorLeft}
        {EditorRight}
      </div>
    </div>
  );
}
