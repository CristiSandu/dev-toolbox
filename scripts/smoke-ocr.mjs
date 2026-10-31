import assert from 'node:assert/strict';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { resolve } from 'node:path';
import { parseJira } from '../src/features/screenshot/parse-jira.ts';

const root = resolve(import.meta.dirname, '..');
const started = performance.now();
const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: resolve(root, 'public/ocr'), cacheMethod: 'none', gzip: true,
  errorHandler: () => {},
});
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(resolve(root, 'tests/fixtures/jira-header.png'), {}, { blocks: true });
  const lines = data.blocks.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines));
  const candidates = parseJira(lines);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].key, 'DEV-42');
  assert.equal(candidates[0].summary, 'Fix login when opening a second window');
  assert.equal(candidates[0].jiraType, 'Bug');
  console.log(`Local OCR smoke passed (${Math.round(performance.now() - started)} ms, synthetic English fixture).`);
} finally {
  await worker.terminate();
}
