import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJson } from '../src/features/formatter/json-formatting.ts';
import { MAX_TEXT_BYTES } from '../src/features/formatter/text-limits.ts';

test('formats nested JSON with two-space indentation, including empty containers', () => {
  assert.equal(formatJson(' {"a":[1,true,null,{"b":[]}],"empty":{}} '), '{\n  "a": [\n    1,\n    true,\n    null,\n    {\n      "b": []\n    }\n  ],\n  "empty": {}\n}');
});
test('preserves numeric lexemes, duplicate keys, key order and escaped string contents', () => {
  const input = '{"id":9007199254740993,"id":1e400,"10":-0,"2":1.2300,"text":"a  b, [ ] { } : \\" \\\\ \\n \\u0061 café"}';
  const output = formatJson(input);
  assert.ok(output.includes('9007199254740993'));
  assert.ok(output.includes('1e400'));
  assert.ok(output.includes('-0'));
  assert.ok(output.includes('1.2300'));
  assert.ok(output.indexOf('"10"') < output.indexOf('"2"'));
  assert.equal((output.match(/"id":/g) ?? []).length, 2);
  assert.equal(output.match(/"text": (.*)/)[1], input.match(/"text":(.*)}/)[1]);
  assert.equal(formatJson(output), output);
});
test('supports JSON primitive roots', () => {
  for (const value of ['null','false','true','-123.50e+2','"hello"','[]','{}']) assert.equal(formatJson(` \n${value} `), value);
});
test('rejects invalid JSON, oversized input and excessive nesting', () => {
  for (const input of ['', '{', '{"a":1,}', '{a:1}', '[1,,2]', '// comment\n{}', 'undefined', 'true false']) assert.throws(() => formatJson(input));
  assert.throws(() => formatJson(' '.repeat(MAX_TEXT_BYTES + 1)), /2 MiB/);
  assert.throws(() => formatJson('['.repeat(201) + '0' + ']'.repeat(201)), /nesting/);
});

test('bounds indentation expansion for small but deeply nested input', () => {
  const input = '['.repeat(190) + Array(25000).fill('0').join(',') + ']'.repeat(190);
  assert.throws(() => formatJson(input), /output limit/);
});
