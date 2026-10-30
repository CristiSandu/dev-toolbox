import { useSyncExternalStore } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createAppUpdater } from "./app-updater";

// Shared across dialog openings and StrictMode effects so installs cannot overlap.
const updater = createAppUpdater({ check: () => check({ timeout: 15_000 }), relaunch });
let backgroundStarted = false;

export function useAppUpdater() {
  const state = useSyncExternalStore(updater.subscribe, updater.getSnapshot);
  return { state, check: updater.check, install: updater.install, restart: updater.restart };
}

export async function checkOnceInBackground() {
  if (backgroundStarted) return null;
  backgroundStarted = true;
  return updater.check();
}
