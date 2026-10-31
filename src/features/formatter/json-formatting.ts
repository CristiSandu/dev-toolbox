import { MAX_TEXT_BYTES, textBytes } from './text-limits.ts';

export function formatJson(input: string): string {
  if (textBytes(input) > MAX_TEXT_BYTES) throw new Error('JSON formatting supports up to 2 MiB. Reduce the input size.');
  if (!input.trim()) throw new Error('Enter a JSON value to format.');
  // Parse only to validate. Serializing parsed values would round large numbers and drop duplicate keys.
  try { JSON.parse(input); }
  catch (error) { throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Check the syntax.'}`); }
  const tokens = input.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
  const pieces: string[] = [];
  let depth = 0;
  let length = 0;
  const append = (piece: string) => {
    length += piece.length;
    if (length > 8 * 1024 * 1024) throw new Error('Formatted JSON exceeds the 8 MiB output limit. Reduce the input size.');
    pieces.push(piece);
  };
  const newline = () => append(`\n${'  '.repeat(depth)}`);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '{' || token === '[') {
      append(token);
      if (++depth > 200) throw new Error('JSON exceeds the supported nesting depth of 200.');
      if (tokens[index + 1] !== '}' && tokens[index + 1] !== ']') newline();
    } else if (token === '}' || token === ']') {
      depth--;
      if (tokens[index - 1] !== '{' && tokens[index - 1] !== '[') newline();
      append(token);
    } else if (token === ',') {
      append(','); newline();
    } else append(token === ':' ? ': ' : token);
  }
  const output = pieces.join('');
  if (textBytes(output) > 8 * 1024 * 1024) throw new Error('Formatted JSON exceeds the 8 MiB output limit. Reduce the input size.');
  return output;
}
