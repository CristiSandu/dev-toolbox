export interface McpSetup {
  nativePath: string;
  nativeAvailable: boolean;
  bridgePath: string;
  bridgeAvailable: boolean;
  nodeCommand: string;
}

export function mcpClientConfig(setup: McpSetup, pdf: boolean, node: string): string {
  return JSON.stringify({
    mcpServers: {
      "dev-toolbox": pdf
        ? { command: node, args: ["--experimental-strip-types", setup.bridgePath, setup.nativePath] }
        : { command: setup.nativePath, args: [] },
    },
  }, null, 2);
}
