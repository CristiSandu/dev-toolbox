import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" |
  "downloading" | "installing" | "restarting" | "restart-required" | "error";

export interface UpdateInfo {
  version: string;
  body?: string;
}

interface AvailableUpdate extends UpdateInfo {
  downloadAndInstall: (onEvent: (event: DownloadEvent) => void, options: { timeout: number }) => Promise<void>;
  close: () => Promise<void>;
}

export interface UpdateState {
  status: UpdateStatus;
  update: UpdateInfo | null;
  downloaded: number;
  total?: number;
  error?: string;
  failedAction?: "check" | "install";
}

export function createAppUpdater(dependencies: {
  check: () => Promise<AvailableUpdate | null>;
  relaunch: () => Promise<void>;
}) {
  let state: UpdateState = { status: "idle", update: null, downloaded: 0 };
  let update: AvailableUpdate | null = null;
  let busy = false;
  const listeners = new Set<() => void>();
  const setState = (next: UpdateState) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

  const restart = async () => {
    setState({ ...state, status: "restarting", error: undefined });
    try {
      await dependencies.relaunch();
    } catch (error) {
      // Installation succeeded. Never offer to install the same update again.
      setState({ ...state, status: "restart-required", error: errorText(error) });
    }
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async check() {
      if (busy || state.status === "restart-required" || state.status === "restarting") return null;
      busy = true;
      setState({ status: "checking", update: null, downloaded: 0 });
      try {
        // A fresh check replaces the Rust resource held by the previous result.
        const previous = update;
        update = null;
        if (previous) await previous.close();
        update = await dependencies.check();
        const info = update ? { version: update.version, body: update.body } : null;
        setState({ status: info ? "available" : "up-to-date", update: info, downloaded: 0 });
        return info;
      } catch (error) {
        setState({ status: "error", update: null, downloaded: 0, error: errorText(error), failedAction: "check" });
        return null;
      } finally {
        busy = false;
      }
    },
    async install() {
      if (busy || !update || (state.status !== "available" && !(state.status === "error" && state.failedAction === "install"))) return;
      busy = true;
      setState({ ...state, status: "downloading", downloaded: 0, total: undefined, error: undefined, failedAction: undefined });
      try {
        await update.downloadAndInstall(event => {
          if (event.event === "Started") {
            setState({ ...state, total: event.data.contentLength, downloaded: 0 });
          } else if (event.event === "Progress") {
            setState({ ...state, downloaded: state.downloaded + event.data.chunkLength });
          } else {
            setState({ ...state, status: "installing" });
          }
        }, { timeout: 120_000 });
        await restart();
      } catch (error) {
        setState({ ...state, status: "error", error: errorText(error), failedAction: "install" });
        return;
      } finally {
        busy = false;
      }
    },
    async restart() {
      if (busy || state.status !== "restart-required") return;
      busy = true;
      await restart();
      busy = false;
    },
  };
}

export function downloadPercent(state: UpdateState): number | undefined {
  if (!state.total || state.total <= 0) return undefined;
  return Math.min(100, Math.floor(state.downloaded / state.total * 100));
}
