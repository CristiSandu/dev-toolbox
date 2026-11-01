# Builds, validation, and releases

## Target policy

The release matrix is explicit. A successful build is not a substitute for an installation smoke test.

| Platform | Rust target | Native CI runner | Installers | Verification status |
|---|---|---|---|---|
| macOS Apple Silicon | `aarch64-apple-darwin` | `macos-15` | DMG and archived app | Local M0 build results in [BASELINES.md](BASELINES.md); CI and install/upgrade checks required |
| macOS Intel | `x86_64-apple-darwin` | `macos-15-intel` | DMG and archived app | Configured; native CI and install/upgrade checks pending |
| Windows x64 | `x86_64-pc-windows-msvc` | `windows-2022` | NSIS EXE and MSI | Configured; native CI and install/upgrade checks pending |

Linux, Windows ARM, and mobile are outside the supported release matrix. Do not advertise an untested target as supported. Runner versions describe the build environment, not a promise of compatibility with every older OS. Record actual runtime OS versions with release smoke-test results.

Runner architecture labels follow [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). The pipeline follows the [Tauri GitHub distribution model](https://v2.tauri.app/distribute/pipelines/github/), using the project-local CLI and locked Cargo dependencies.

## Local validation

Use Node 24 for parity with CI, Rust stable, and the native prerequisites in the README. The JS tests use Node's built-in test runner and type stripping; no frontend test dependency is required. The explicit type-stripping flag also supports the project's existing Node 22.12 minimum. Type checking still happens in `npm run build`.

```bash
npm ci
npm run check:versions
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Build installers for the machine's architecture, for example:

```bash
npm run tauri build -- --ci --config src-tauri/tauri.unsigned.conf.json --target aarch64-apple-darwin --bundles app dmg -- --locked
```

Use `x86_64-apple-darwin` on Intel macOS. On Windows x64 use:

```powershell
npm run tauri build -- --ci --config src-tauri/tauri.unsigned.conf.json --target x86_64-pc-windows-msvc --bundles nsis msi -- --locked
```

The `npm run tauri` wrapper first builds the native MCP sidecar with its Rust PDF renderer and embedded fonts. Tauri automatically packages the Cargo executable from `src/bin`; the wrapper applies `tauri.mcp.conf.json` for the font license. Do not also register this Cargo executable in `externalBin`, which creates duplicate MSI components. No Node runtime or JavaScript PDF bundle is shipped. Do not bypass the wrapper with a direct `npx tauri build`. CI verifies the relocated standalone MCP executable without Node or other application files, using isolated data.

The Rust target must be installed with `rustup target add <target>`. An explicit target places build output under `src-tauri/target/<target>/release/bundle/`.

The unsigned override is for validation builds. Tagged releases require the updater signing key and generate signed archives/signatures; follow [UPDATER.md](UPDATER.md) for key custody, CI secrets, platform-signing prerequisites, and signed local builds.

Tests protect existing task-name normalization (including current punctuation behavior), XML/XAML formatting, EAN-13 validation, barcode formats, backup compatibility, regenerated import IDs, timestamps/payloads, and database reopening. Backup tests use temporary files and databases, never the installed application's data. They do not establish real installer upgrade behavior or scanner readability.

## Pull request checks

`.github/workflows/validate.yml` runs for pull requests and pushes to `main`. Each native target runs version validation, JS tests, Rust tests, and a full Tauri installer build, which includes TypeScript compilation. Installer artifacts are retained for seven days. macOS apps are tarred so executable permissions and bundle structure survive artifact download.

Configure branch protection in GitHub to require all three `Build and test (<target>)` checks. This repository change does not configure remote branch protection. Review fork PRs normally; validation needs no signing secrets or release-write permission.

## Prepare an explicit release

Merging a feature PR no longer bumps a version or publishes a release. Keep M0 unreleased until its manual gates pass; the example below is for a subsequent deliberate release.

1. Create a release PR. Choose a stable `X.Y.Z` version: patch for fixes, minor for the milestones in the roadmap. Prerelease version/channel automation is outside M0.
2. Set all application versions in one command, for example:

   ```bash
   npm run version:set -- 0.2.0
   npm run check:versions
   ```

   The script updates `package.json`, both npm lockfile version entries, `src-tauri/tauri.conf.json`, the Rust package version, and its Cargo lock entry. It preserves dependency versions and refuses to start if the existing application versions disagree. Review all five files and rerun the checks above. If interrupted while writing, restore these version-only edits and rerun; this is not an atomic multi-file transaction.

3. Move completed entries from `CHANGELOG.md`'s Unreleased section into a dated version section. Include known limitations, data changes, and recovery notes.
4. Merge the reviewed release PR with all native checks passing. Tag that exact merged commit, using the version in its files. Example maintainer commands after checking out the merged commit:

   ```bash
   npm run check:versions -- v0.2.0
   git tag -a v0.2.0 -m "Dev Toolbox 0.2.0"
   git push origin v0.2.0
   ```

5. The tag workflow calls the same native validation with signing enabled and checks tag/version agreement. Each target's updater artifacts must pass native signature verification against the committed public key. After every target succeeds, the job assembles a complete `latest.json` and collects installers, signed packages, signatures, and the manifest into a **draft** GitHub Release. It does not commit, bump versions, or create tags itself.
6. Download the draft artifacts and complete the checklist below on every advertised target. Edit the generated release notes using the changelog, then publish the draft through GitHub Releases. A draft is intentional: packaging checks alone cannot prove data retention or OS trust behavior.

If a build fails, no release job runs. Re-run a transient failure against the same source; for a source fix, use a new reviewed release version/tag. Do not move an already distributed tag or overwrite a published installer to hide a change.

## Installation and data-retention checklist

Use a dedicated OS test account or machine. The production identifier is `com.sanduilie-cristian.dev-toolbox`, and test installations with that identifier can access real existing user data. Keep the identifier and app-data path unchanged for actual upgrades.

- [ ] Record source tag/commit, OS version, architecture, installer type, and test date.
- [ ] Install the preceding release and create several tasks plus single/multi code-history entries. Record task/history counts, representative fields, and timestamps.
- [ ] Export both histories to backups. With the app closed, also copy `tasks.db` if testing full database recovery.
- [ ] Record the database location resolved under Tauri's AppData directory. Confirm it is outside the replaceable `.app`/installation folder. On macOS, check `~/Library/Application Support/com.sanduilie-cristian.dev-toolbox/`; on Windows record the actual resolved location rather than assuming it.
- [ ] Quit the old app and install the candidate over it using the same installer type. Do not uninstall or delete app data first.
- [ ] Launch the candidate and verify version, counts, fields, timestamps, task creation, branch/PR copy, XML formatting, all barcode types, SVG/PNG where supported, and both histories after another restart. DataMatrix PNG is currently unsupported by the Rust command; SVG remains available.
- [ ] Verify task/history JSON export and import in a separate clean test profile. Imports append records and assign new IDs; do not test restoration by importing into the only copy of valuable history.
- [ ] Start the installed app offline and exercise the local tools. About & updates must report a failed manual check without blocking normal use. Test the actual updater path with a subsequent controlled version before broad rollout.
- [ ] Open installed Test Plans → MCP settings and check the connection. Connect a real agent using the copied configuration, test full-case/codes-only PDFs and JSON round trips in the test profile without Node installed, then update the app in place and reconnect with the same configuration.
- [ ] Check keyboard navigation, window resizing, and available themes.
- [ ] Record installer size and launch timing using [BASELINES.md](BASELINES.md).
- [ ] Document macOS Gatekeeper/Windows trust prompts honestly. Updater signatures do not replace platform signing/notarization.

## Recovery

Keep the previous release installer and backups accessible. Before reinstalling an older app, close the current app and preserve its database. An old binary is not guaranteed to understand a newer schema. Restore a compatible closed-app database backup, or use compatible JSON imports in a clean test profile. Never delete the only database copy as an upgrade troubleshooting step.

M1 adds signed update artifacts and a complete manifest to the release workflow. Follow [UPDATER.md](UPDATER.md) for first-install limitations, key backup, and actual updater-path tests before publishing.
