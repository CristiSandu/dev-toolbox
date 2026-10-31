// MCP entrypoint adds the app's shared PDF renderer to the native tool set.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import pdfMake from 'pdfmake';
import fonts from 'pdfmake/build/fonts/Roboto.js';
import { buildCasePdf } from '../src/features/test-plans/pdf-document.ts';
for (const [name, font] of Object.entries(fonts.vfs)) pdfMake.virtualfs.writeFileSync(name, Buffer.from(font.data, 'base64'));
pdfMake.addFonts(fonts.fonts);
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => false);
async function main() {
const executable = process.argv[2] ?? resolve(dirname(process.argv[1]), '../src-tauri/target/debug/dev-toolbox-mcp');
const child = spawn(executable, [...process.argv.slice(3), '--native'], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
let sequence = 0;
const pending = new Map();
child.on('error', error => { console.error(error.message); process.exit(1); });
child.on('exit', code => { for (const { reject } of pending.values()) reject(new Error('Native MCP server exited')); process.exitCode = code ?? 1; });
createInterface({ input: child.stdout }).on('line', line => {
  const response = JSON.parse(line);
  const waiter = pending.get(response.id);
  if (waiter) { pending.delete(response.id); waiter.resolve(response); }
});
function rpc(request) {
  return new Promise((resolve, reject) => {
    const id = `pdf-bridge-${++sequence}`;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ ...request, id }) + '\n');
  });
}
async function tool(name, args) {
  const response = await rpc({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args } });
  if (response.error) throw new Error(response.error.message);
  if (response.result.isError) throw new Error(response.result.content[0].text);
  return JSON.parse(response.result.content[0].text);
}
const pdfTool = {
  name: 'export_test_case_pdf',
  description: 'Render a saved case to a local PDF with the app renderer. Supports full case or codesOnly. Returns unavailable image and failed barcode counts.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    caseId: { type: 'integer' }, filePath: { type: 'string' }, codesOnly: { type: 'boolean', default: false },
  }, required: ['caseId', 'filePath'] },
};
async function exportPdf(args) {
  if (!args || !Number.isSafeInteger(args.caseId) || typeof args.filePath !== 'string' || !args.filePath ||
      (args.codesOnly !== undefined && typeof args.codesOnly !== 'boolean') || Object.keys(args).some(k => !['caseId', 'filePath', 'codesOnly'].includes(k)))
    throw new Error('Expected caseId, filePath and optional boolean codesOnly');
  const cases = await tool('list_test_cases', {});
  const saved = cases.find(c => c.id === args.caseId);
  if (!saved) throw new Error('Case no longer exists');
  const projects = await tool('list_test_projects', {});
  const assets = new Map();
  let failedCodes = 0, unavailableImages = 0;
  for (const list of saved.content.lists) for (const product of list.products) {
    const asset = {};
    try {
      if (product.text.trim() !== product.text || /[^\x20-\x7e]/.test(product.text)) throw new Error('Use printable ASCII without leading/trailing spaces or control characters.');
      const kind = { 'QR Code': 'qr', 'EAN-13': 'ean13', DataMatrix: 'datamatrix', Code128: 'code128' }[product.type];
      const data = await tool('generate_barcode', { kind, data: product.text, format: 'svg' });
      asset.svg = decodeURIComponent(data.slice(data.indexOf(',') + 1));
    } catch (error) { asset.error = error.message; failedCodes++; }
    if (!args.codesOnly && product.imageUrl) {
      try {
        const image = await tool('fetch_test_product_image', { url: product.imageUrl });
        // pdfmake embeds PNG and JPEG; other formats remain explicit omissions.
        if (!/^data:image\/(png|jpeg);base64,/.test(image)) throw new Error('Unsupported PDF image format');
        asset.image = image;
      } catch { unavailableImages++; }
    }
    assets.set(product.id, asset);
  }
  const bytes = await pdfMake.createPdf(buildCasePdf(saved.content, projects.find(p => p.id === saved.projectId)?.name ?? '', assets, args.codesOnly ?? false)).getBuffer();
  await tool('save_test_case_pdf', { filePath: args.filePath, bytes: Array.from(bytes) });
  return { filePath: args.filePath, revision: saved.revision, failedCodes, unavailableImages };
}
try {
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let request;
    try { request = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); continue; }
    if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || (request.id !== undefined && request.id !== null && typeof request.id !== 'number' && typeof request.id !== 'string')) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }) + '\n'); continue; }
    if (request.id === undefined) { child.stdin.write(line + '\n'); continue; }
    let response;
    if (request.method === 'tools/call' && request.params?.name === pdfTool.name) {
      try {
        const value = await exportPdf(request.params.arguments);
        response = { result: { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false } };
      } catch (error) { response = { result: { content: [{ type: 'text', text: error.message }], isError: true } }; }
    } else {
      response = await rpc(request);
      if (request.method === 'tools/list' && response.result) response.result.tools.push(pdfTool);
    }
    process.stdout.write(JSON.stringify({ ...response, jsonrpc: '2.0', id: request.id }) + '\n');
  }
} finally { child.stdin.end(); }

}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
