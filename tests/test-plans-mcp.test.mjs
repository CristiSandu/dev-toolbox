import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('MCP PDF bridge discovers tools and renders both PDF modes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'toolbox-mcp-'));
  const fake = join(dir, 'native.mjs');
  await writeFile(fake, `#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
for await (const line of createInterface({input:process.stdin})) {
 const r=JSON.parse(line); if(r.id===undefined) continue;
 let result={};
 if(r.method==='tools/list') result={tools:[]};
 if(r.method==='tools/call') {
  const {name,arguments:a}=r.params;
  let value=null;
  if(name==='list_test_cases') value=[{id:1,projectId:1,revision:2,content:{schemaVersion:1,title:'PDF fixture',descriptionMarkdown:'# Steps',lists:[{id:'l',name:'Products',products:[{id:'p',title:'Image fixture',type:'QR Code',text:'test',imageUrl:'https://example.com/p.png',description:''}]}]}}];
  if(name==='generate_barcode') value='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="black"/></svg>');
  if(name==='fetch_test_product_image') value='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
  if(name==='list_test_projects') value=[{id:1,name:'Project'}];
  if(name==='save_test_case_pdf') writeFileSync(a.filePath,Buffer.from(a.bytes));
  result={content:[{type:'text',text:JSON.stringify(value)}]};
 }
 console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result}));
}
`);
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/test-plans-mcp.mjs', process.execPath, fake], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', data => stderr += data);
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const request = async (method, params) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    const line = await lines.next();
    assert.equal(line.done, false, stderr);
    return JSON.parse(line.value);
  };
  try {
    assert.equal((await request('tools/list')).result.tools[0].name, 'export_test_case_pdf');
    for (const codesOnly of [false, true]) {
      const filePath = join(dir, `${codesOnly}.pdf`);
      const response = await request('tools/call', { name: 'export_test_case_pdf', arguments: { caseId: 1, filePath, codesOnly } });
      assert.equal(response.result.isError, false, JSON.stringify(response));
      assert.equal((await readFile(filePath)).subarray(0, 5).toString(), '%PDF-');
      const result = JSON.parse(response.result.content[0].text);
      assert.equal(result.revision, 2);
      assert.equal(result.unavailableImages, 0);
      assert.equal(result.failedCodes, 0);
    }
    const invalid = await request('tools/call', { name: 'export_test_case_pdf', arguments: { caseId: 1, filePath: 'x', codesOnly: 'yes' } });
    assert.equal(invalid.result.isError, true);
  } finally { child.kill(); await rm(dir, { recursive: true, force: true }); }
});

test('MCP settings configuration preserves executable paths and arguments', async () => {
  const { mcpClientConfig } = await import('../src/features/test-plans/mcp-config.ts');
  const setup = { executablePath: 'C:\\My Tools\\dev-toolbox-mcp.exe', available: true, development: false };
  const config = JSON.parse(mcpClientConfig(setup)).mcpServers['dev-toolbox'];
  assert.equal(config.command, setup.executablePath);
  assert.deepEqual(config.args, []);
});


test('packaging rejects private runtimes that would depend on developer-installed macOS libraries', async () => {
  const { validateMacRuntimeDependencies } = await import('../scripts/prepare-mcp-bundle.mjs');
  assert.doesNotThrow(() => validateMacRuntimeDependencies('/node (architecture arm64):\n\t/usr/lib/libSystem.B.dylib (compatibility version 1)\n\t/System/Library/Frameworks/Security.framework/Security (compatibility version 1)'));
  assert.throws(() => validateMacRuntimeDependencies('/node:\n\t/opt/homebrew/opt/icu4c/lib/libicu.dylib (compatibility version 1)'), /official standalone Node/);
});
