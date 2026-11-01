export interface McpSetup {
  executablePath: string;
  available: boolean;
  development: boolean;
}

export function mcpClientConfig(setup: McpSetup): string {
  return JSON.stringify({ mcpServers: {
    "dev-toolbox": { command: setup.executablePath, args: [] },
  } }, null, 2);
}
