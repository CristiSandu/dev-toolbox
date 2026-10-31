import { isTauri } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";

export function confirmAction(message: string, title = "Discard unsaved changes?") {
  return isTauri() ? confirm(message, { title, kind: "warning" }) : Promise.resolve(window.confirm(message));
}
