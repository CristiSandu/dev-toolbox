// Exercises a relocated installation with no Node on PATH and an isolated database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { copyFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const scratch = await mkdtemp(join(tmpdir(), 'toolbox-installed-mcp-'));
const suffix = process.platform === 'win32' ? '.exe' : '';
const mac = process.platform === 'darwin';
const bin = join(scratch, 'Installed App', ...(mac ? ['Contents', 'MacOS'] : []));
await mkdir(bin, { recursive: true });
const source = resolve(process.argv[2]);
await copyFile(source, join(bin, `dev-toolbox-mcp${suffix}`));
let png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=', 'base64');
const images = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(png); });
await new Promise(resolve => images.listen(0, '127.0.0.1', resolve));
const imageUrl = `http://127.0.0.1:${images.address().port}/image.png`;
const child = spawn(join(bin, `dev-toolbox-mcp${suffix}`), [], {
  cwd: scratch,
  env: { ...process.env, PATH: '', NODE_PATH: '', NODE_OPTIONS: '', DEV_TOOLBOX_MCP_DATABASE: join(scratch, 'isolated.db') },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', data => stderr += data);
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
let id = 0;
async function rpc(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
  let timer;
  try {
    const next = await Promise.race([lines.next(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`MCP response timed out: ${stderr}`)), 15000); })]);
    assert.equal(next.done, false, `MCP server exited: ${stderr}`);
    const response = JSON.parse(next.value);
    assert.equal(response.id, id);
    assert.equal(response.error, undefined, JSON.stringify(response));
    return response.result;
  } finally { clearTimeout(timer); }
}
async function tool(name, args = {}) {
  const result = await rpc('tools/call', { name, arguments: args });
  if (result.isError) throw new Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
}
try {
  const initialized = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'installed-app-smoke', version: '1' } });
  assert.equal(initialized.serverInfo.name, 'dev-toolbox-test-plans');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  assert.equal((await rpc('tools/list')).tools.length, 15);
  png = Buffer.from((await tool('generate_barcode', { kind: 'qr', data: 'Product image', format: 'png' })).split(',')[1], 'base64');
  assert.deepEqual(await tool('list_test_projects'), []);
  const projectId = await tool('save_test_project', { name: 'Installed smoke' });
  const content = { schemaVersion: 1, title: 'Installed export', descriptionMarkdown: '# Steps\n\n- [ ] Scan **every** product.', lists: [{ id: 'list', name: 'Codes', products: ['EAN-13', 'Code128', 'DataMatrix', 'QR Code'].map((type, index) => ({ id: `p${index}`, title: type, type, text: type === 'EAN-13' ? '4006381333931' : 'Installed-code-001', imageUrl: index === 0 ? imageUrl : '', description: 'Test description' })) }] };
  let saved = await tool('save_test_case', { projectId, expectedRevision: 0, content });
  const first = saved;
  saved = await tool('save_test_case', { id: saved.id, projectId, expectedRevision: saved.revision, content: { ...content, title: 'Edited' } });
  assert.equal(saved.revision, 2);
  await assert.rejects(tool('save_test_case', { id: saved.id, projectId, expectedRevision: first.revision, content }));
  assert.equal((await tool('get_test_case_revisions', { caseId: saved.id })).length, 2);
  for (const codesOnly of [false, true]) {
    const filePath = join(scratch, `${codesOnly ? 'codes' : 'full'}.pdf`);
    const result = await tool('export_test_case_pdf', { caseId: saved.id, filePath, codesOnly });
    assert.equal(result.failedCodes, 0);
    assert.equal(result.unavailableImages, 0);
    assert.equal((await readFile(filePath)).subarray(0, 5).toString(), '%PDF-');
  }
  const filePath = join(scratch, 'project.json');
  await tool('export_test_project', { projectId, filePath });
  const document = await tool('read_test_plan_import', { filePath });
  const imported = await tool('import_test_plan', { document });
  assert.notEqual(imported, projectId);
  assert.equal((await tool('list_test_cases')).length, 2);
  await tool('delete_test_case', { id: saved.id });
  await tool('delete_test_project', { id: projectId });
  await tool('delete_test_project', { id: imported });
  assert.deepEqual(await tool('list_test_cases'), []);
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.stdin.end();
  await exited;
  console.log('Installed MCP smoke passed: 15 tools, all barcode formats, PNG images, both PDF modes, revisions/conflicts, JSON transfer and deletion; empty PATH, relocated files, isolated data.');
} finally {
  child.stdin.end();
  child.kill();
  await new Promise(resolve => images.close(resolve));
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
