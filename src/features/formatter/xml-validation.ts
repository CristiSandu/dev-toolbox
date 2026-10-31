import { MAX_TEXT_BYTES, textBytes } from './text-limits.ts';
export { MAX_TEXT_BYTES, LARGE_TEXT_BYTES, textBytes } from './text-limits.ts';

export function validateXml(input: string): string | null {
  if (textBytes(input) > MAX_TEXT_BYTES) return 'Formatting supports up to 2 MiB of XML. Reduce the input size.';
  if (!input.trim()) return 'Enter an XML or XAML document to format.';
  if (/<!DOCTYPE\s/i.test(input)) return 'DOCTYPE declarations are not supported. Remove the declaration before formatting.';
  const document = new DOMParser().parseFromString(input, 'application/xml');
  const error = Array.from(document.getElementsByTagName('parsererror')).find(element =>
    ['http://www.mozilla.org/newlayout/xml/parsererror.xml', 'http://www.w3.org/1999/xhtml'].includes(element.namespaceURI ?? ''),
  );
  return error ? (error.textContent ?? 'Invalid XML').replace(/Below is a rendering[\s\S]*/i, '').trim().slice(0, 600) : null;
}
