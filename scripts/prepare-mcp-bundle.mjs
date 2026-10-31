import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, chmod, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function hostTarget() {
  return execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
}
export function validateMacRuntimeDependencies(output) {
  const libraries = output.split(/\r?\n/).filter(line => /^\s/.test(line)).map(line => line.trim().split(' (')[0]);
  for (const library of libraries) {
    if (!library.startsWith('/usr/lib/') && !library.startsWith('/System/Library/'))
      throw new Error(`Node depends on ${library}. Build with the official standalone Node distribution instead of a runtime linked to local packages.`);
  }
}
export async function prepareMcpBundle(target = hostTarget(), debug = false) {
  const supported = { 'aarch64-apple-darwin': ['darwin', 'arm64'], 'x86_64-apple-darwin': ['darwin', 'x64'], 'x86_64-pc-windows-msvc': ['win32', 'x64'] };
  const platform = supported[target];
  if (!platform || platform[0] !== process.platform || platform[1] !== process.arch)
    throw new Error(`Build ${target} on its native runner with matching Node architecture; refusing to package the wrong runtime.`);
  if (process.platform === 'darwin') validateMacRuntimeDependencies(execFileSync('otool', ['-L', process.execPath], { encoding: 'utf8' }));
  const stage = join(root, 'src-tauri', '.mcp-bundle');
  await mkdir(join(stage, 'resources'), { recursive: true });
  const args = ['build', '--locked', '--manifest-path', join(root, 'src-tauri/Cargo.toml'), '--bin', 'dev-toolbox-mcp', '--target', target];
  if (!debug) args.push('--release');
  // The sidecar is compiled before the packaging overlay is applied by the CLI.
  execFileSync('cargo', args, { cwd: root, stdio: 'inherit' });
  const extension = process.platform === 'win32' ? '.exe' : '';
  const native = join(root, 'src-tauri/target', target, debug ? 'debug' : 'release', `dev-toolbox-mcp${extension}`);
  await copyFile(native, join(stage, `dev-toolbox-mcp-${target}${extension}`));
  await copyFile(process.execPath, join(stage, `dev-toolbox-mcp-runtime-${target}${extension}`));
  if (process.platform !== 'win32') {
    await chmod(join(stage, `dev-toolbox-mcp-${target}`), 0o755);
    await chmod(join(stage, `dev-toolbox-mcp-runtime-${target}`), 0o755);
  }
  const result = await build({
    entryPoints: [join(root, 'scripts/test-plans-mcp.mjs')],
    outfile: join(stage, 'resources/server.cjs'), bundle: true, platform: 'node',
    format: 'cjs', target: 'node22', metafile: true, legalComments: 'eof',
  });
  // Keep third-party notices beside the renderer, including the embedded font license.
  const notices = [];
  const packages = new Set();
  for (const input of Object.keys(result.metafile.inputs)) {
    const match = input.match(/^(.*node_modules\/((?:@[^/]+\/)?[^/]+))/);
    if (match) packages.add(match[1]);
  }
  for (const packagePath of [...packages].sort()) {
    const dir = resolve(root, packagePath);
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    let license = '';
    for (const file of (await readdir(dir)).filter(file => /^(licen[cs]e(?:[._-].*)?|copying)$/i.test(file))) {
      license += await readFile(join(dir, file), 'utf8') + '\n';
    }
    if (!license) {
      // Some npm distributions omit a license file; retain their declared metadata and source banners.
      license = `Declared license: ${JSON.stringify(pkg.license)}\nAuthor: ${JSON.stringify(pkg.author)}\nRepository: ${JSON.stringify(pkg.repository)}\nSee notices in server.cjs.`;
    }
    notices.push(`${pkg.name} ${pkg.version}\n${license}`);
  }
  // Node's LICENSE includes its bundled third-party notices.
  const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cannot retrieve Node ${process.versions.node} license: ${response.status}`);
  notices.push(`Node.js ${process.versions.node}\n${await response.text()}`);
  notices.push(await readFile(join(root, 'scripts/licenses/Roboto-OFL.txt'), 'utf8'));
  await writeFile(join(stage, 'resources/THIRD-PARTY-NOTICES.txt'), notices.join('\n\n---\n\n'));
  await writeFile(join(stage, 'resources/runtime.json'), JSON.stringify({ node: process.versions.node, target }) + '\n');
  console.log(`Prepared self-contained MCP runtime for ${target}.`);
  return { stage, target, native };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareMcpBundle(process.argv.slice(2).find(arg => !arg.startsWith('--')) || hostTarget(), process.argv.includes('--debug'));
}
