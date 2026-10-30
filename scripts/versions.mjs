import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const versionFiles = [
  'package.json', 'package-lock.json', 'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock',
];

const cargoManifestVersion = /(^\[package\]\r?\n[\s\S]*?^version = ")([^"]+)(")/m;
const cargoLockVersion = /(^\[\[package\]\]\r?\nname = "dev-toolbox"\r?\nversion = ")([^"]+)(")/m;
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readFiles(root) {
  return Object.fromEntries(versionFiles.map(file => [file, readFileSync(resolve(root, file), 'utf8')]));
}

function tomlVersion(text, pattern, file) {
  const match = text.match(pattern);
  if (!match) throw new Error(`Missing application version in ${file}`);
  return match[2];
}

export function checkVersions(root, tag) {
  const files = readFiles(root);
  const pkg = JSON.parse(files['package.json']);
  const lock = JSON.parse(files['package-lock.json']);
  if (!stableVersion.test(pkg.version)) throw new Error('Expected a stable version such as 0.2.0');
  const versions = {
    'package-lock.json': lock.version,
    'package-lock.json packages[""]': lock.packages?.['']?.version,
    'src-tauri/tauri.conf.json': JSON.parse(files['src-tauri/tauri.conf.json']).version,
    'src-tauri/Cargo.toml': tomlVersion(files['src-tauri/Cargo.toml'], cargoManifestVersion, 'Cargo.toml'),
    'src-tauri/Cargo.lock': tomlVersion(files['src-tauri/Cargo.lock'], cargoLockVersion, 'Cargo.lock'),
  };
  for (const [file, version] of Object.entries(versions)) {
    if (version !== pkg.version) throw new Error(`${file}: expected ${pkg.version}, found ${version}`);
  }
  if (tag !== undefined && tag !== `v${pkg.version}`) {
    throw new Error(`Release tag ${tag} does not match v${pkg.version}`);
  }
  return pkg.version;
}

export function setVersion(root, version) {
  if (!stableVersion.test(version)) throw new Error('Expected a stable version such as 0.2.0');
  checkVersions(root);
  const files = readFiles(root);
  // Prepare all contents before writing; dependency versions stay untouched.
  for (const file of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
    const data = JSON.parse(files[file]);
    data.version = version;
    if (file === 'package-lock.json') data.packages[''].version = version;
    files[file] = `${JSON.stringify(data, null, 2)}\n`;
  }
  files['src-tauri/Cargo.toml'] = files['src-tauri/Cargo.toml'].replace(cargoManifestVersion, (_, start, _old, end) => `${start}${version}${end}`);
  files['src-tauri/Cargo.lock'] = files['src-tauri/Cargo.lock'].replace(cargoLockVersion, (_, start, _old, end) => `${start}${version}${end}`);
  for (const [file, content] of Object.entries(files)) writeFileSync(resolve(root, file), content);
  return checkVersions(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const [command, value, ...extra] = process.argv.slice(2);
    if (extra.length || !['check', 'set'].includes(command) || (command === 'set' && !value)) {
      throw new Error('Usage: node scripts/versions.mjs check [vX.Y.Z] | set X.Y.Z');
    }
    const version = command === 'set' ? setVersion(root, value) : checkVersions(root, value);
    console.log(`Application versions agree: ${version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
