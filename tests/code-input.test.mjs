import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBatchInput, parseCodeHistory, normalizeType, isSamePayload, codeHistorySummary } from '../src/lib/code-input.ts';
import { historyTime, historyDate } from '../src/lib/history.ts';

test('line batches preserve source line numbers for actionable per-code errors', () => {
  assert.deepEqual(parseBatchInput('first\r\n\r\n second ', 'lines', 'QR Code'), { items: [
    { text: 'first', type: 'QR Code', description: '', position: 1 },
    { text: 'second', type: 'QR Code', description: '', position: 3 },
  ], errors: [] });
});

test('mixed JSON keeps valid codes and reports malformed items instead of silently losing them', () => {
  const result = parseBatchInput(JSON.stringify([{ text: 'https://example.com', type: 'qr' }, null, { text: '123', type: 'unsupported' }, { text: 4006381333931, type: 'EAN-13', description: 'sample' }]), 'json', 'Code128');
  assert.deepEqual(result.items.map(item => [item.position, item.text, item.type]), [[1, 'https://example.com', 'QR Code'], [4, '4006381333931', 'EAN-13']]);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /Item 2/);
  assert.match(result.errors[1], /Item 3/);
  for (const input of ['{', '{}', '[]']) assert.throws(() => parseBatchInput(input, 'json', 'QR Code'));
});

test('documented GS1 aliases remain usable in batch examples and backups', () => {
  for (const alias of ['Ean128', 'GS1-128', 'code128', 'Code128']) assert.deepEqual(normalizeType(alias), { uiType: 'Code128', kind: 'code128' });
});

test('current history restores only a valid editable snapshot', () => {
  const payload = { mode: 'single', singleType: 'QR Code', singleText: 'Hello café' };
  assert.deepEqual(parseCodeHistory(JSON.stringify(payload)), payload);
  for (const input of ['{', 'null', '[]', '{"mode":"single"}', '{"mode":"single","singleType":"bad","singleText":"x"}']) assert.equal(parseCodeHistory(input), null);
});

test('the legacy backup fixture can be reopened without changing its export format', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/codegen-history-v1.json', import.meta.url), 'utf8'));
  const payload = parseCodeHistory(fixture.entries[0].payload);
  assert.equal(payload.mode, 'multi');
  assert.equal(payload.multiMode, 'json');
  assert.equal(parseBatchInput(payload.multiText, payload.multiMode, payload.multiType).items.length, 2);
});

test('malformed imported dates do not destabilize recent-history sorting or rendering', () => {
  assert.equal(historyTime('invalid'), 0);
  assert.equal(historyDate('invalid'), 'Date unavailable');
  assert.ok(historyTime('2026-10-31T10:00:00Z') > historyTime('2026-10-30T10:00:00Z'));
});


test('restored history does not duplicate when JSON property order changes', () => {
  const saved = { mode: 'multi', multiMode: 'json', multiType: 'QR Code', multiText: '[{"text":"x","type":"qr"}]' };
  const restored = parseCodeHistory(JSON.stringify(saved));
  assert.notEqual(JSON.stringify(saved), JSON.stringify(restored));
  assert.equal(isSamePayload(saved, restored), true);
  assert.equal(isSamePayload(saved, { ...restored, multiText: 'different' }), false);
  assert.equal(isSamePayload(null, restored), false);
  assert.equal(isSamePayload({ mode: 'single', singleType: 'QR Code', singleText: 'x' }, { singleText: 'x', singleType: 'QR Code', mode: 'single' }), true);
});

test('history titles explain a batch without exposing raw JSON as its name', () => {
  const payload = { mode: 'multi', multiMode: 'json', multiType: 'QR Code', multiText: '[{"text":"x","type":"qr"},{"text":"123","type":"ean13"}]' };
  assert.equal(codeHistorySummary(payload), 'Mixed-format batch · 2 inputs');
  assert.equal(codeHistorySummary(null, 'Legacy label'), 'Legacy label');
});
