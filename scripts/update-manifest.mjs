import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkVersions } from './versions.mjs';

export const platformsByTarget = {
  'aarch64-apple-darwin': ['darwin-aarch64'],
  'x86_64-apple-darwin': ['darwin-x86_64'],
  'x86_64-pc-windows-msvc': ['windows-x86_64-nsis', 'windows-x86_64-msi'],
};

function singleFile(directory, suffix, version) {
  const matches = readdirSync(directory).filter(name => name.endsWith(suffix) && (!version || name.includes(`_${version}_`)));
  if (matches.length !== 1) throw new Error(`Expected one ${suffix} artifact in ${directory}, found ${matches.length}`);
  return join(directory, matches[0]);
}

export function prepareArtifacts(target, bundleDirectory, outputDirectory, version) {
  const expected = platformsByTarget[target];
  if (!expected) throw new Error(`Unsupported release target: ${target}`);
  mkdirSync(outputDirectory, { recursive: true });
  const platforms = {};
  const stage = (platform, source, name = basename(source)) => {
    const signature = readFileSync(`${source}.sig`, 'utf8').trim();
    if (!signature) throw new Error(`Missing signature for ${name}`);
    copyFileSync(source, join(outputDirectory, name));
    copyFileSync(`${source}.sig`, join(outputDirectory, `${name}.sig`));
    platforms[platform] = { file: name, signature };
  };
  if (target.endsWith('apple-darwin')) {
    const dmg = singleFile(join(bundleDirectory, 'dmg'), '.dmg', version);
    copyFileSync(dmg, join(outputDirectory, basename(dmg)));
    stage(expected[0], singleFile(join(bundleDirectory, 'macos'), '.app.tar.gz'), `dev-toolbox_${version}_${expected[0]}.app.tar.gz`);
  } else {
    stage(expected[0], singleFile(join(bundleDirectory, 'nsis'), '.exe', version));
    stage(expected[1], singleFile(join(bundleDirectory, 'msi'), '.msi', version));
  }
  const metadata = { version, platforms };
  writeFileSync(join(outputDirectory, `updater-${target}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

export function createManifest(directory, version, repository, notes) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Expected a GitHub owner/repository');
  const platforms = {};
  for (const [target, expected] of Object.entries(platformsByTarget)) {
    const metadata = JSON.parse(readFileSync(join(directory, `updater-${target}.json`), 'utf8'));
    if (metadata.version !== version) throw new Error(`Version mismatch for ${target}`);
    if (JSON.stringify(Object.keys(metadata.platforms).sort()) !== JSON.stringify([...expected].sort())) {
      throw new Error(`Incomplete or unexpected platforms for ${target}`);
    }
    for (const [platform, entry] of Object.entries(metadata.platforms)) {
      if (typeof entry.file !== 'string' || basename(entry.file) !== entry.file || /[\\/]/.test(entry.file)) throw new Error(`Invalid asset name for ${platform}`);
      const path = join(directory, entry.file);
      if (!statSync(path).isFile() || !statSync(path).size) throw new Error(`Empty artifact: ${entry.file}`);
      if (!entry.signature || readFileSync(`${path}.sig`, 'utf8').trim() !== entry.signature) throw new Error(`Signature mismatch for ${platform}`);
      platforms[platform] = {
        url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(entry.file)}`,
        signature: entry.signature,
      };
    }
  }
  return { version, notes, pub_date: new Date().toISOString(), platforms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const version = checkVersions(root, process.env.RELEASE_TAG);
    const [command, argument] = process.argv.slice(2);
    if (command === 'prepare') {
      if (!platformsByTarget[argument]) throw new Error(`Unsupported release target: ${argument}`);
      rmSync(join(root, 'release-artifacts'), { recursive: true, force: true });
      prepareArtifacts(argument, join(root, 'src-tauri/target', argument, 'release/bundle'), join(root, 'release-artifacts'), version);
    } else if (command === 'merge' && argument) {
      const config = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
      const repository = config.plugins.updater.endpoints[0].match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/latest\/download\/latest\.json$/)?.[1];
      if (!repository || (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.toLowerCase() !== repository.toLowerCase())) throw new Error('Repository does not match the configured update endpoint');
      const section = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split(/^## /m).find(part => part.startsWith(`${version}\n`) || part.startsWith(`${version} `));
      const notes = section?.split('\n').slice(1).join('\n').trim();
      if (!notes) throw new Error(`Missing changelog notes for ${version}`);
      const manifest = createManifest(resolve(argument), version, repository, notes);
      writeFileSync(join(resolve(argument), 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    } else {
      throw new Error('Usage: node scripts/update-manifest.mjs prepare <rust-target> | merge <artifact-directory>');
    }
    console.log(`Updater artifacts validated (${command}, ${version}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
