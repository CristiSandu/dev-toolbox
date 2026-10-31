import type { OcrLine } from './parse-jira';

export function recognizeScreenshot(file: File, signal: AbortSignal, progress: (message: string) => void): Promise<OcrLine[]> {
  signal.throwIfAborted();
  // Owning the outer worker lets cancellation stop even Tesseract's initialization.
  // Terminating a worker also terminates its nested workers.
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' });
  const local = new URL(`${(import.meta.env?.BASE_URL ?? "/")}ocr/`, window.location.href).href;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, lines?: OcrLine[]) => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(lines ?? []);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('Recognition timed out')), 120_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => finish(new Error('Recognition worker failed'));
    worker.onmessage = ({ data }) => {
      if (data.kind === 'progress') progress(data.message);
      else if (data.kind === 'result') finish(undefined, data.lines);
      else if (data.kind === 'error') finish(new Error('Could not recognize image'));
    };
    worker.postMessage({ file, local });
  });
}
