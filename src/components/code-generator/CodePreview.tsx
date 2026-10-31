import { useState } from "react";
import { QrCode, Copy, Download } from "lucide-react";
import { EmptyState } from "@/components/workspace";
import { AnimatedActionButton } from "@/components/animated-action-button";
import { copySvgFromDataUrl, downloadSvgFromDataUrl, downloadPngFromDataUrl, getImageStyleForType } from "@/lib/barcode-utils";
import { svgForCode, type GeneratedCode } from "@/lib/code-generation";

export function CodePreview({ result, stale = false, busy = false }: { result: GeneratedCode | null; stale?: boolean; busy?: boolean }) {
  const [scale, setScale] = useState(1);
  return <section className="pane h-full">
    <div className="pane-heading"><h2>Preview</h2>{result && <label className="preview-size">Size<input aria-label="Preview size" type="range" min={50} max={300} step={10} value={scale * 100} onChange={event => setScale(Number(event.target.value) / 100)} /><output>{Math.round(scale * 100)}%</output></label>}</div>
    {stale && <p className="inline-notice mx-4 mt-4" role="status">Input has changed. Generate again to update this preview.</p>}
    {busy && <p role="status" className="px-5 py-3 text-sm text-muted-foreground">Generating…</p>}
    {result ? <>
      <div className="preview-stage"><span className="type-badge">{result.type}</span><div className="max-w-full overflow-auto"><div className="code-image"><img src={result.dataUrl} alt={`${result.type} encoding ${result.text}`} style={getImageStyleForType(result.type, scale)} /></div></div><p className="preview-value">{result.text}</p>{result.description && <p className="text-center text-sm text-muted-foreground">{result.description}</p>}</div>
      <div className="preview-actions"><AnimatedActionButton label="SVG" Icon={Download} doneLabel="Saved" onAction={async () => downloadSvgFromDataUrl(await svgForCode(result), result.text)} /><AnimatedActionButton label="PNG" Icon={Download} doneLabel="Saved" onAction={() => downloadPngFromDataUrl(result.dataUrl, result.text)} /><AnimatedActionButton label="Copy SVG" Icon={Copy} doneLabel="Copied" onAction={async () => copySvgFromDataUrl(await svgForCode(result))} /></div>
    </> : <EmptyState icon={QrCode} title="Your code will appear here" description="Choose a format, enter a value, and generate a code to preview or export." />}
  </section>;
}
