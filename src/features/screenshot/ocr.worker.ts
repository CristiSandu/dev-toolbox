import { createWorker, OEM, PSM } from 'tesseract.js';

self.onmessage = async ({ data: { file, local } }: MessageEvent<{ file: File; local: string }>) => {
  let engine: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    // Explicit local paths prevent Tesseract's default CDN downloads.
    engine = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${local}worker.min.js`, corePath: local, langPath: local,
      cacheMethod: 'none', workerBlobURL: false, gzip: true,
      logger: ({ status, progress }) => self.postMessage({ kind: 'progress', message: `${status} · ${Math.round(progress * 100)}%` }),
      errorHandler: () => self.postMessage({ kind: 'error' }),
    });
    await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await engine.recognize(file, {}, { blocks: true });
    const lines = (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map(({ text, confidence, bbox }) => ({ text, confidence, bbox }))));
    self.postMessage({ kind: 'result', lines });
  } catch {
    self.postMessage({ kind: 'error' });
  } finally {
    await engine?.terminate();
  }
};
