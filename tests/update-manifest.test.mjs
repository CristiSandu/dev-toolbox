import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { platformsByTarget, prepareArtifacts, createManifest } from '../scripts/update-manifest.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dev-toolbox-manifest-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'output');
  for (const target of Object.keys(platformsByTarget)) {
    const bundle = join(root, target);
    const make = (folder, name, signed) => {
      mkdirSync(join(bundle, folder), { recursive: true });
      const path = join(bundle, folder, name);
      writeFileSync(path, `Artifact for ${target}: ${name}`);
      if (signed) writeFileSync(`${path}.sig`, `test-signature-${target}-${name}\n`);
    };
    if (target.endsWith('apple-darwin')) {
      make('dmg', `dev-toolbox_0.2.0_${target}.dmg`, false);
      make('dmg', `dev-toolbox_0.1.9_${target}.dmg`, false);
      make('macos', 'dev-toolbox.app.tar.gz', true);
    } else {
      make('nsis', 'dev toolbox_0.2.0_x64-setup.exe', true);
      make('msi', 'dev-toolbox_0.2.0_x64_en-US.msi', true);
    }
    prepareArtifacts(target, bundle, output, '0.2.0');
  }
  return { root, output };
}

test('manifest preserves both macOS architectures and each Windows installer type', t => {
  const { output } = fixture(t);
  const manifest = createManifest(output, '0.2.0', 'CristiSandu/dev-toolbox', 'Release notes');
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.notes, 'Release notes');
  assert.equal(Object.keys(manifest.platforms).length, 4);
  assert.notEqual(manifest.platforms['darwin-aarch64'].url, manifest.platforms['darwin-x86_64'].url);
  assert.match(manifest.platforms['windows-x86_64-nsis'].url, /download\/v0\.2\.0\/dev%20toolbox_0\.2\.0_x64-setup\.exe$/);
  assert.match(manifest.platforms['windows-x86_64-msi'].url, /\.msi$/);
  for (const entry of Object.values(manifest.platforms)) {
    assert.match(entry.url, /^https:\/\/github.com\/CristiSandu\/dev-toolbox\/releases\/download\/v0\.2\.0\//);
    assert.ok(entry.signature.startsWith('test-signature-'));
  }
});

test('release assembly rejects missing target metadata and mismatched versions', t => {
  const { output } = fixture(t);
  assert.throws(() => createManifest(output, '0.2.1', 'CristiSandu/dev-toolbox', 'notes'), /Version mismatch/);
  rmSync(join(output, 'updater-x86_64-apple-darwin.json'));
  assert.throws(() => createManifest(output, '0.2.0', 'CristiSandu/dev-toolbox', 'notes'), /ENOENT/);
});

test('release assembly rejects missing signatures, missing installer types, and unsafe asset paths', t => {
  const { output } = fixture(t);
  const path = join(output, 'updater-x86_64-pc-windows-msvc.json');
  const original = JSON.parse(readFileSync(path, 'utf8'));
  const check = change => {
    const metadata = structuredClone(original);
    change(metadata);
    writeFileSync(path, JSON.stringify(metadata));
    assert.throws(() => createManifest(output, '0.2.0', 'CristiSandu/dev-toolbox', 'notes'));
  };
  check(metadata => { delete metadata.platforms['windows-x86_64-msi']; });
  check(metadata => { metadata.platforms['windows-x86_64-msi'].signature = 'wrong'; });
  check(metadata => { metadata.platforms['windows-x86_64-msi'].file = '../private.key'; });
});

test('artifact preparation fails when a signature is absent or artifacts are ambiguous', t => {
  const { root } = fixture(t);
  const bundle = join(root, 'aarch64-apple-darwin');
  const path = join(bundle, 'macos/dev-toolbox.app.tar.gz.sig');
  rmSync(path);
  assert.throws(() => prepareArtifacts('aarch64-apple-darwin', bundle, join(root, 'bad'), '0.2.0'), /ENOENT/);
  writeFileSync(path, 'signature');
  writeFileSync(join(bundle, 'macos/another.app.tar.gz'), 'ambiguous');
  assert.throws(() => prepareArtifacts('aarch64-apple-darwin', bundle, join(root, 'bad'), '0.2.0'), /Expected one/);
});
