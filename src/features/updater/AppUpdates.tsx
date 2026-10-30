import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { downloadPercent } from "./app-updater";
import type { UpdateState } from "./app-updater";
import { checkOnceInBackground, useAppUpdater } from "./useAppUpdater";

function statusMessage(state: UpdateState): string {
  switch (state.status) {
    case "checking": return "Checking for updates…";
    case "up-to-date": return "You’re up to date.";
    case "available": return `Version ${state.update?.version} is available.`;
    case "downloading": return "Downloading update…";
    case "installing": return "Verifying and installing update…";
    case "restarting": return "Restarting Dev Toolbox…";
    case "restart-required": return "Update installed. Restart Dev Toolbox to finish.";
    case "error":
      return state.failedAction === "check"
        ? "Couldn’t check for updates. Check your connection and try again."
        : "The update could not be installed. Try again, or download it from Releases.";
    default: return "Check for a new version of Dev Toolbox.";
  }
}

export function AppUpdates() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string>();
  const { state, check, install, restart } = useAppUpdater();
  const desktop = isTauri();
  const busy = ["checking", "downloading", "installing", "restarting"].includes(state.status);
  const installed = state.status === "restart-required" || state.status === "restarting";
  const canInstall = state.status === "available" || (state.status === "error" && state.failedAction === "install");
  const percent = downloadPercent(state);

  useEffect(() => {
    if (!desktop) return;
    void getVersion().then(setVersion).catch(() => setVersion("unavailable"));
    if (import.meta.env.DEV) return;
    const timer = window.setTimeout(() => {
      void checkOnceInBackground().then(update => {
        if (update) toast(`Dev Toolbox ${update.version} is available`, {
          action: { label: "Review update", onClick: () => setOpen(true) },
          duration: 10_000,
        });
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [desktop]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="About and updates" title="About and updates">
          <Info aria-hidden="true" />
          <span className="hidden sm:inline">About &amp; updates</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dev Toolbox</DialogTitle>
          <DialogDescription>
            {desktop ? `Version ${version ?? "…"}` : "Updates are available in the desktop app."}
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="updates-heading" className="space-y-4 border-t pt-5">
          <h2 id="updates-heading" className="font-semibold">Software updates</h2>
          <p role="status" className="text-sm leading-relaxed">{statusMessage(state)}</p>
          {state.status === "downloading" && (
            <div className="space-y-2">
              <progress aria-label="Update download" value={percent} max={100} className="h-2 w-full accent-primary" />
              <p className="text-sm text-muted-foreground tabular-nums">
                {percent === undefined
                  ? `${(state.downloaded / 1_000_000).toFixed(1)} MB downloaded`
                  : `${percent}% downloaded`}
              </p>
            </div>
          )}
          {state.update && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Release notes · {state.update.version}</h3>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm leading-relaxed">
                {state.update.body?.trim() || "No release notes were provided."}
              </div>
            </div>
          )}
          {state.error && (
            <details className="text-sm">
              <summary className="cursor-pointer underline-offset-4 focus-visible:outline-2">Error details</summary>
              <p className="mt-2 max-h-28 overflow-auto break-words text-muted-foreground">{state.error}</p>
            </details>
          )}
          {canInstall && <p className="text-sm text-muted-foreground">Save any work before updating. Dev Toolbox will restart to finish installation.</p>}
          {(state.status === "downloading" || state.status === "installing") && (
            <p className="text-sm text-muted-foreground">Keep Dev Toolbox open while the update finishes. You can close this panel.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {!installed && <Button variant={canInstall ? "outline" : "default"} disabled={!desktop || busy} onClick={() => void check()}>
              {state.status === "checking" ? "Checking…" : state.status === "error" ? "Check again" : "Check for updates"}
            </Button>}
            {canInstall && <Button onClick={() => void install()}>Update and restart</Button>}
            {state.status === "restart-required" && <Button onClick={() => void restart()}>Restart now</Button>}
          </div>
        </section>

        <DialogFooter className="border-t pt-4 sm:justify-between">
          <Button variant="link" className="px-0" onClick={() => {
            void openUrl("https://github.com/CristiSandu/dev-toolbox/releases").catch(() => toast.error("Couldn’t open Releases. Try again."));
          }}>View releases</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>{canInstall ? "Later" : "Close"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
