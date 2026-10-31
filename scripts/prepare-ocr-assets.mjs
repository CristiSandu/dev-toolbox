import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'public/ocr');
await mkdir(destination, { recursive: true });
const copies = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/LICENSE.md', 'TESSERACT-LICENSE.txt'],
  ['tesseract.js-core/LICENSE', 'CORE-LICENSE.txt'],
  ['@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', 'eng.traineddata.gz'],
];
for (const variant of ['lstm', 'simd-lstm']) {
  for (const extension of ['wasm.js', 'wasm']) {
    const name = `tesseract-core-${variant}.${extension}`;
    copies.push([`tesseract.js-core/${name}`, name]);
  }
}
await Promise.all(copies.map(([source, name]) => copyFile(resolve(root, 'node_modules', source), resolve(destination, name))));
await writeFile(resolve(destination, 'NOTICE.txt'), 'Offline OCR: Tesseract.js and tesseract.js-core (Apache-2.0), https://github.com/naptha/tesseract.js\nEnglish trained data: @tesseract.js-data/eng (Apache-2.0), https://github.com/naptha/tessdata\nSee the included engine Apache-2.0 license texts.\n');
console.log('Prepared bundled, offline English OCR assets.');
