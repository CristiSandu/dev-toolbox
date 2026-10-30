import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkVersions, setVersion, versionFiles } from '../scripts/versions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dev-toolbox-version-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'src-tauri'));
  for (const file of versionFiles) writeFileSync(join(directory, file), readFileSync(join(root, file)));
  return directory;
}

test('version check matches every application declaration and the release tag', t => {
  const directory = fixture(t);
  const version = checkVersions(directory);
  assert.equal(checkVersions(directory, `v${version}`), version);
  assert.throws(() => checkVersions(directory, 'v999.0.0'), /does not match/);
});

test('every version location is checked, including both npm lockfile entries', t => {
  const directory = fixture(t);
  for (const file of versionFiles) {
    const path = join(directory, file);
    const original = readFileSync(path, 'utf8');
    const version = checkVersions(directory);
    const changed = file === 'src-tauri/Cargo.lock'
      ? original.replace(`name = "dev-toolbox"\nversion = "${version}"`, 'name = "dev-toolbox"\nversion = "999.0.0"')
      : original.replace(`"${version}"`, '"999.0.0"');
    writeFileSync(path, changed);
    assert.throws(() => checkVersions(directory), /expected/, file);
    writeFileSync(path, original);
  }
  const path = join(directory, 'package-lock.json');
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  lock.packages[''].version = '999.0.0';
  writeFileSync(path, JSON.stringify(lock));
  assert.throws(() => checkVersions(directory), /packages/);
});

test('setting a minor version updates all versions without changing dependencies', t => {
  const directory = fixture(t);
  const before = JSON.parse(readFileSync(join(directory, 'package-lock.json'), 'utf8'));
  const cargoBefore = readFileSync(join(directory, 'src-tauri/Cargo.lock'), 'utf8');
  const oldVersion = checkVersions(directory);
  const [major, minor] = oldVersion.split('.').map(Number);
  const nextVersion = `${major}.${minor + 1}.0`;
  assert.equal(setVersion(directory, nextVersion), nextVersion);
  assert.equal(checkVersions(directory, `v${nextVersion}`), nextVersion);
  const after = JSON.parse(readFileSync(join(directory, 'package-lock.json'), 'utf8'));
  before.version = nextVersion;
  before.packages[''].version = nextVersion;
  assert.deepEqual(after, before);
  assert.equal(readFileSync(join(directory, 'src-tauri/Cargo.lock'), 'utf8'),
    cargoBefore.replace(`name = "dev-toolbox"\nversion = "${oldVersion}"`, `name = "dev-toolbox"\nversion = "${nextVersion}"`));
});

test('invalid versions are rejected before touching any files', t => {
  const directory = fixture(t);
  const before = versionFiles.map(file => readFileSync(join(directory, file), 'utf8'));
  for (const version of ['v0.2.0', '0.2', '01.2.0', '0.2.0-beta.1', '0.2.0\n']) {
    assert.throws(() => setVersion(directory, version), /stable version/);
  }
  assert.deepEqual(versionFiles.map(file => readFileSync(join(directory, file), 'utf8')), before);
});
