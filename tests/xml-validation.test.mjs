import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TEXT_BYTES, textBytes, validateXml } from '../src/features/formatter/xml-validation.ts';

test('XML size checks count UTF-8 bytes and reject oversized input before parsing', () => {
  assert.equal(textBytes('café'), 5);
  assert.equal(textBytes('😀'), 4);
  assert.match(validateXml('x'.repeat(MAX_TEXT_BYTES + 1)), /2 MiB/);
});
test('blank input and DTDs are rejected without attempting XML parsing', () => {
  assert.match(validateXml(' \n '), /Enter/);
  assert.match(validateXml('<!DOCTYPE root SYSTEM "https://example.test/external"><root/>'), /DOCTYPE/);
  assert.match(validateXml('<!DOCTYPE root [<!ENTITY a "text">]><root>&a;</root>'), /DOCTYPE/);
});
