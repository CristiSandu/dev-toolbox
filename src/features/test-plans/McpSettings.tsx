import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, Loader2, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import AnimatedCopyButton from "@/components/animated-copy-button";
import { mcpClientConfig, type McpSetup } from "./mcp-config";

export function McpSettings() {
  const [open, setOpen] = useState(false);
  const generation = useRef(0);
  const [setup, setSetup] = useState<McpSetup | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setSetup(null); setLoadError(""); setStatus("idle"); setError("");
    if (!isTauri()) { setLoadError("Open the desktop app to configure the local MCP server."); return; }
    invoke<McpSetup>("get_mcp_setup").then(info => {
      if (!active) return;
      setSetup(info);
    }).catch(reason => { if (active) setLoadError(String(reason)); });
    return () => { active = false; generation.current++; };
  }, [open]);
  const checking = status === "checking";
  const available = !!setup?.available;
  const check = async () => {
    const current = generation.current;
    setStatus("checking"); setError("");
    try { await invoke("check_mcp_connection"); if (current === generation.current) setStatus("ready"); }
    catch (reason) { if (current === generation.current) { setError(String(reason)); setStatus("error"); } }
  };
  const config = setup ? mcpClientConfig(setup) : "";
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="outline"><Plug aria-hidden="true" /> MCP settings</Button></SheetTrigger>
    <SheetContent className="flex w-full flex-col gap-6 overflow-y-auto p-6 sm:max-w-xl">
      <div className="space-y-2 pr-6">
        <SheetTitle>Connect an agent</SheetTitle>
        <SheetDescription>Let an MCP client work with saved Test Plans on this device.</SheetDescription>
      </div>
      {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : !setup ?
        <p role="status" className="text-sm text-muted-foreground">Loading server configuration…</p> : <>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Server status</h3>
          <p role="status" className="flex items-center gap-2 text-sm" aria-live="polite">
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : status === "ready" ? <Check className="size-4" aria-hidden="true" /> : null}
            {!setup.available ? "MCP installation incomplete" : checking ? "Checking MCP handshake…" : status === "ready" ? "Ready · handshake verified" : status === "error" ? "Connection check failed" : "Not checked"}
          </p>
          <p className="text-sm text-muted-foreground">Your agent client starts the stdio server automatically. This check starts a temporary server and closes it afterward. Other clients’ connections aren’t visible here.</p>
          {!setup.available && <div className="space-y-2 text-sm">
            <p>Repair or reinstall Dev Toolbox to restore the bundled MCP components.</p>
            {setup.development && <p>For a development build, run <code>npm run build:mcp</code> from the project directory, then reopen this panel.</p>}
            <p className="break-all text-muted-foreground">Expected server: {setup.executablePath}</p>
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button variant="outline" disabled={!available || checking} onClick={() => void check()}>
            <RefreshCw aria-hidden="true" /> {checking ? "Checking…" : "Check connection"}
          </Button>
        </div>
        <div className="space-y-2 border-t pt-5">
          <h3 className="text-sm font-medium">All Test Plans tools included</h3>
          <p className="text-sm text-muted-foreground">Projects, cases, products, Markdown, revision history, JSON import/export, barcode generation, and full-case or codes-only PDFs. Everything runs locally using the components installed with the app.</p>
        </div>
        <div className="space-y-3 border-t pt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Client configuration</h3>
            <AnimatedCopyButton text={available && !checking ? config : ""} label="Copy MCP configuration" />
          </div>
          <p className="text-sm text-muted-foreground">Paste this into your client’s MCP configuration, then reconnect. No Node installation or source checkout is needed. App updates include the MCP components; reconnect your client after updating.</p>
          <pre tabIndex={0} aria-label="MCP client configuration" className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{config}</pre>
          <p className="text-sm text-muted-foreground">Connected agents can edit and permanently delete saved plans and read or write files for imports and exports. Reload Test Plans after agent edits; unsaved drafts stay in the app.</p>
        </div>
      </>}
    </SheetContent>
  </Sheet>;
}
