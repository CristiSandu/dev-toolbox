import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CaseContent } from "./model";

interface PdfResult { filePath: string; failedCodes: number; unavailableImages: number }
export async function createCasePdf(
  source: CaseContent, projectName: string, filePath: string,
  signal: AbortSignal, onProgress: (message: string) => void, codesOnly = false,
) {
  signal.throwIfAborted();
  const jobId = crypto.randomUUID();
  const unlisten = await listen<{ jobId: string; message: string }>("test-plan-pdf-progress", event => {
    if (event.payload.jobId === jobId) {
      if (signal.aborted) cancel();
      else onProgress(event.payload.message);
    }
  });
  const cancel = () => { void invoke("cancel_test_case_pdf", { jobId }).catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    return await invoke<PdfResult>("export_test_case_pdf", { jobId, content: source, projectName, filePath, codesOnly });
  } finally { signal.removeEventListener("abort", cancel); unlisten(); }
}
