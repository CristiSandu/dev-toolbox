import test from 'node:test';
import assert from 'node:assert/strict';

test('MCP settings configuration preserves executable paths and arguments', async () => {
  const { mcpClientConfig } = await import('../src/features/test-plans/mcp-config.ts');
  const setup = { executablePath: 'C:\\My Tools\\dev-toolbox-mcp.exe', available: true, development: false };
  const config = JSON.parse(mcpClientConfig(setup)).mcpServers['dev-toolbox'];
  assert.equal(config.command, setup.executablePath);
  assert.deepEqual(config.args, []);
});

test('Cargo executables are not also packaged as external binaries', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const root = new URL('../src-tauri/', import.meta.url);
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const cargoBinaries = new Set([packageJson.name, ...(await readdir(new URL('src/bin/', root))).map(name => name.replace(/\.rs$/, ''))]);
  for (const name of (await readdir(root)).filter(name => /^tauri.*\.conf\.json$/.test(name))) {
    const config = JSON.parse(await readFile(new URL(name, root), 'utf8'));
    for (const path of config.bundle?.externalBin ?? []) {
      const binary = path.replaceAll('\\', '/').split('/').at(-1).replace(/\.exe$/i, '');
      assert.ok(!cargoBinaries.has(binary), `${name}: ${binary} is already bundled through Cargo; externalBin would install it twice`);
    }
  }
});
