import test from 'node:test';
import assert from 'node:assert/strict';

test('MCP settings configuration preserves executable paths and arguments', async () => {
  const { mcpClientConfig } = await import('../src/features/test-plans/mcp-config.ts');
  const setup = { executablePath: 'C:\\My Tools\\dev-toolbox-mcp.exe', available: true, development: false };
  const config = JSON.parse(mcpClientConfig(setup)).mcpServers['dev-toolbox'];
  assert.equal(config.command, setup.executablePath);
  assert.deepEqual(config.args, []);
});
