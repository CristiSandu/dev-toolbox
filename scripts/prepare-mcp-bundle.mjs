import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, rm, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function hostTarget() {
  return execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
}
export async function prepareMcpBundle(target = hostTarget(), debug = false) {
  const supported = ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc'];
  if (!supported.includes(target)) throw new Error(`Unsupported release target: ${target}`);
  const args = ['build', '--locked', '--manifest-path', join(root, 'src-tauri/Cargo.toml'), '--bin', 'dev-toolbox-mcp', '--target', target];
  if (!debug) args.push('--release');
  execFileSync('cargo', args, { cwd: root, stdio: 'inherit' });
  const stage = join(root, 'src-tauri', '.mcp-bundle');
  // Drop obsolete Node/JS staging files when upgrading a checkout to the native renderer.
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  const extension = target.includes('windows') ? '.exe' : '';
  const native = join(root, 'src-tauri/target', target, debug ? 'debug' : 'release', `dev-toolbox-mcp${extension}`);
  const output = join(stage, `dev-toolbox-mcp-${target}${extension}`);
  await copyFile(native, output);
  if (!target.includes('windows')) await chmod(output, 0o755);
  console.log(`Prepared native MCP server with Rust PDF export for ${target}.`);
  return { stage, target, native };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareMcpBundle(process.argv.slice(2).find(arg => !arg.startsWith('--')) || hostTarget(), process.argv.includes('--debug'));
}
