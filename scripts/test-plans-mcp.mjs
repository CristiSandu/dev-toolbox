// Compatibility for existing source-checkout configurations; installed clients use the binary directly.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
const executable = process.argv[2] ?? resolve(dirname(process.argv[1]), '../src-tauri/target/debug/dev-toolbox-mcp');
const child = spawn(executable, process.argv.slice(3), { stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
