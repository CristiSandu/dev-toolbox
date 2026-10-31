import { run } from '@tauri-apps/cli';
import { prepareMcpBundle, hostTarget } from './prepare-mcp-bundle.mjs';
const args = process.argv.slice(2);
if (['build', 'bundle'].includes(args[0]) && !args.includes('--help') && !args.includes('-h')) {
  const index = args.findIndex(arg => arg === '--target' || arg === '-t');
  const target = index >= 0 ? args[index + 1] : args.find(arg => arg.startsWith('--target='))?.slice(9) || hostTarget();
  await prepareMcpBundle(target, args.includes('--debug') || args.includes('-d'));
  const separator = args.indexOf('--');
  args.splice(separator < 0 ? args.length : separator, 0, '--config', 'src-tauri/tauri.mcp.conf.json');
}
await run(args, 'tauri');
