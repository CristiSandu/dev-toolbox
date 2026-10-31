import test from 'node:test';
import assert from 'node:assert/strict';
import { syncDiffOriginal } from '../src/features/formatter/sync-diff-original.ts';

function model(value) {
  return {
    value, cursor: value.length, undo: ['earlier edit'], replacements: 0,
    getValue() { return this.value; },
    setValue(text) { this.value = text; this.cursor = 0; this.undo = []; this.replacements++; },
  };
}

test('echoing left-side typing does not replace the model, reset the cursor or erase undo', () => {
  const original = model('first line\nsecond line');
  for (const character of ['\n', 'n', 'e', 'w']) {
    original.value += character;
    original.cursor = original.value.length;
    const cursor = original.cursor;
    syncDiffOriginal(original, original.value);
    assert.equal(original.cursor, cursor);
    assert.deepEqual(original.undo, ['earlier edit']);
  }
  assert.equal(original.replacements, 0);
});

test('explicit swap/clear updates still reach the original model once', () => {
  const original = model('old');
  syncDiffOriginal(original, 'swapped text');
  assert.equal(original.value, 'swapped text');
  syncDiffOriginal(original, 'swapped text');
  assert.equal(original.replacements, 1);
  syncDiffOriginal(original, '');
  assert.equal(original.value, '');
  assert.equal(original.replacements, 2);
});
