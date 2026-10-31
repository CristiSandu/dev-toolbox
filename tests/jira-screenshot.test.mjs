import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJira, isIssueKey, suggestedBranch } from '../src/features/screenshot/parse-jira.ts';
import { imageDimensions, validateImage } from '../src/features/screenshot/image-input.ts';
const line = (text, y, height = 24, confidence = 95) => ({ text, confidence, bbox: { x0: 40, y0: y, x1: 700, y1: y + height } });

test('Jira heading extraction joins wrapped titles and keeps type separate from branch', () => {
  const result = parseJira([line('Project / A-42', 20), line('Fix login when the user', 70), line('opens a second window', 99), line('Type: Bug', 170, 16)]);
  assert.deepEqual(result, [{ key: 'A-42', summary: 'Fix login when the user opens a second window', jiraType: 'Bug', confidence: 95 }]);
  assert.equal(suggestedBranch(result[0].jiraType), 'bugfix');
  assert.equal(suggestedBranch('Epic'), 'feature');
});
test('multiple issue keys remain separate and missing or icon-only types remain unknown', () => {
  const result = parseJira([line('DEV-123', 10), line('Add account settings', 60), line('Description', 130), line('Related DEV-456', 220), line('Existing related issue', 260)]);
  assert.deepEqual(result.map(candidate => [candidate.key, candidate.summary, candidate.jiraType]), [['DEV-123','Add account settings',null],['DEV-456','Existing related issue',null]]);
});
test('inline title, low confidence, repeated keys, and non-Jira text', () => {
  const result = parseJira([line('DEV2-7: Support Unicode café', 20, 24, 53), line('DEV2-7', 200)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].summary, 'Support Unicode café');
  assert.equal(result[0].confidence, 53);
  assert.deepEqual(parseJira([line('A holiday photo', 0)]), []);
  for (const key of ['A-1','DEV2-42']) assert.ok(isIssueKey(key));
  for (const key of ['dev-1','1DEV-1','DEV-','DEV-1 extra']) assert.equal(isIssueKey(key),false);
});
const png = (width, height) => {
  const bytes = new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16,width); view.setUint32(20,height);
  return bytes;
};
test('rejects unsupported, oversized and compressed oversized images before decoding', async () => {
  assert.deepEqual(imageDimensions(png(1200,700)), { width:1200,height:700 });
  assert.deepEqual(imageDimensions(new Uint8Array([255,216,255,192,0,7,8,2,188,4,176])), {width:1200,height:700});
  assert.throws(() => imageDimensions(new Uint8Array([1,2,3])));
  await assert.rejects(validateImage(new File([png(16000,16000)],'large.png')));
  await assert.rejects(validateImage(new File([new Uint8Array(11*1024*1024)],'large.png')));
  await validateImage(new File([png(1200,700)],'valid.png'));
});

test('recognition releases workers on result, errors and cancellation during startup', async () => {
  const { recognizeScreenshot } = await import('../src/features/screenshot/recognize.ts');
  const originalWorker = globalThis.Worker;
  const originalWindow = globalThis.window;
  const instances = [];
  globalThis.Worker = class {
    constructor() { instances.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  };
  globalThis.window = { location: { href: 'http://localhost/task' } };
  try {
    const file = new File([png(1200,700)], 'clipboard.png');
    const controller = new AbortController();
    const cancelled = recognizeScreenshot(file, controller.signal, () => {});
    assert.equal(instances[0].message.local, 'http://localhost/ocr/');
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(instances[0].terminated, true);
    assert.equal(instances[0].onmessage, null);

    const statuses = [];
    const success = recognizeScreenshot(file, new AbortController().signal, status => statuses.push(status));
    instances[1].onmessage({ data: { kind: 'progress', message: 'recognizing text · 50%' } });
    instances[1].onmessage({ data: { kind: 'result', lines: [line('DEV-42',0)] } });
    assert.deepEqual(await success, [line('DEV-42',0)]);
    assert.deepEqual(statuses, ['recognizing text · 50%']);
    assert.equal(instances[1].terminated, true);

    const failed = recognizeScreenshot(file, new AbortController().signal, () => {});
    instances[2].onmessage({ data: { kind: 'error' } });
    await assert.rejects(failed, /Could not recognize/);
    assert.equal(instances[2].terminated, true);
    assert.throws(() => recognizeScreenshot(file, controller.signal, () => {}), { name: 'AbortError' });
    assert.equal(instances.length, 3);
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
