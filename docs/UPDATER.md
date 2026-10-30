# In-app updates (M1)

## App behavior

The header's **About & updates** control shows the installed version, release notes, and update status. Packaged apps check in the background once per session after launch. A new release produces one notification with a Review update action; offline/failed background checks remain quiet. Development mode uses manual checks only.

The user chooses **Update and restart** to download and install. Duplicate checks/installations are blocked across dialog openings. Progress handles downloads without a known content length. The dialog can close while the operation continues; this is not a cancellation control. Keep the app running until installation completes.

Tauri verifies the package signature and signed version before installing. On Windows the installer exits/restarts the app; macOS uses the process plugin to relaunch after installation. If relaunch fails after a successful install, the dialog offers Restart now without downloading/installing again. Errors retain details and a check/retry path. Release notes are displayed as escaped text.

`0.1.9` has no updater, so users must install `0.2.0` manually once. Preserve installer type on Windows. Existing tasks/history remain under the unchanged identifier `com.sanduilie-cristian.dev-toolbox`; update code does not migrate, delete, or restore the database.

## Configuration and trust

Production configuration lives in `src-tauri/tauri.conf.json`:

- Updater archives enabled, with a committed public key and `requireSignedVersion: true`.
- Stable endpoint: `https://github.com/CristiSandu/dev-toolbox/releases/latest/download/latest.json`.
- HTTPS transport and normal certificate verification remain enabled. No downgrade comparator is installed.
- Windows passive installer UI, with automatic restart behavior from the updater.
- Updater permissions and process restart permission are limited to the existing main-window capability.

The implementation follows the [official updater API](https://v2.tauri.app/plugin/updater/) and [process plugin](https://v2.tauri.app/plugin/process/). The pinned updater selects installer-specific Windows targets before falling back to a generic platform, so MSI and NSIS entries are kept separate.

## Signing key and GitHub setup

A key pair was generated locally at `~/.config/dev-toolbox/updater.key` and `updater.key.pub`. The private key is outside this repository, has mode `0600`, and has no passphrase. Only its public key is committed in app config. Make a secure, preferably encrypted backup before distributing the first updater-enabled app. Losing/replacing the key after distribution prevents existing installations from accepting future updates signed with a different key.

GitHub CLI was not authenticated during implementation, so repository secrets were not configured. After authenticating to the correct repository, transfer the private key through stdin, for example:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo CristiSandu/dev-toolbox < "$HOME/.config/dev-toolbox/updater.key"
```

Set optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only if using a passphrase-protected key. Never commit or paste the private key into an issue, PR, command argument, or build log. The release build fails clearly when the private-key secret is absent. If an existing trusted key is adopted before first distribution, update the committed public key and regenerate the public signature fixture as well.

The test fixture is a signed, non-executable text payload, not a key or installable update. It is signed for `9999.0.0` to test version binding against the test app. To regenerate it with the configured key:

```bash
npm run tauri signer sign -- --private-key-path "$HOME/.config/dev-toolbox/updater.key" --password '' --app-version 9999.0.0 tests/fixtures/updater-payload.txt
```

## Native builds

Contributor/PR builds deliberately disable updater archive generation so they do not need the private key:

```bash
npm run tauri build -- --ci --config src-tauri/tauri.unsigned.conf.json --target aarch64-apple-darwin --bundles app dmg -- --locked
```

For signed local builds, provide the protected key's path through the environment:

```bash
TAURI_SIGNING_PRIVATE_KEY="$HOME/.config/dev-toolbox/updater.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' \
npm run tauri build -- --ci --target aarch64-apple-darwin --bundles app dmg -- --locked
```

Use the corresponding native target/installer formats on Intel macOS and Windows as documented in [RELEASING.md](RELEASING.md). These signatures secure the updater payload; they do not provide Apple Developer ID signing/notarization or a Windows publisher certificate. Those credentials and any required certificate-import/signing steps still need distribution setup. Do not claim a seamless Gatekeeper/SmartScreen experience until tested on clean machines.

## Release pipeline

1. Prepare a reviewed release PR with synchronized versions and a matching numbered changelog section, then tag the merged commit. M1 prepares `0.2.0`; no tag/release is created merely by implementing it.
2. The release calls the shared validation workflow with `sign-updates: true`, explicitly passing the two signing secrets. PR/branch validation receives neither secret and builds with the unsigned override.
3. Native jobs run tests, build signed packages, and stage the current version's files with `node scripts/update-manifest.mjs prepare <rust-target>`. macOS archives receive distinct architecture filenames, preventing Intel/Apple Silicon collisions.
4. Each signed job downloads its actual staged packages through a loopback test server using the native updater. Verification must pass against the committed public key and announced version before upload. This catches a mismatched CI signing key.
5. After all targets succeed, the release job merges metadata into one `latest.json`, checking the version, all required platforms, nonempty artifacts, matching signature files, and the configured GitHub repository. URLs point to immutable version-tag asset paths; notes come from that version's changelog section.
6. The draft includes installers, updater packages, signatures, and the complete manifest. Complete native installation/upgrade/trust checks before publishing. Drafts and prereleases do not become the stable channel. Do not mark a test prerelease as the latest stable release.

Required manifest entries are `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64-nsis`, and `windows-x86_64-msi`. Keep older complete releases available for recovery. Do not publish a new stable release missing `latest.json`, including a hotfix, because GitHub's latest-release endpoint would then stop resolving the updater feed.

## Checks and remaining rollout gates

Automated checks:

- JS tests cover concurrent operations, no-update/offline recovery, progress with known/unknown sizes, install failure, and restart failure/retry.
- Manifest tests cover all target entries, filename collisions/escaping, missing artifacts/signatures, mismatched versions, and unsafe asset paths.
- Native tests download a signed fixture, reject changed bytes, and reject a mismatched signed version. No installer is invoked by those tests.
- Signed-build verification is an explicitly opt-in native test. CI supplies `UPDATER_SMOKE_DIRECTORY` and runs it with `--ignored`; regular test runs do not pretend to have generated installer artifacts.

Before publishing `0.2.0`, complete a controlled `0.2.0 → 0.2.1` update on macOS and both Windows installer types, with populated tasks and code history. Test deferral, offline checks, failed downloads, and invalid signatures, using a dedicated OS profile/app identity. Verify relaunch, installed version, and database contents; a successful download alone does not prove installation. Record evidence and unverified targets in the M1 section of [BASELINES.md](BASELINES.md).

The stable HTTPS endpoint cannot provide a real update until a complete release is published. GitHub secrets, remote CI, platform signing/notarization, and Windows/Intel upgrade verification remain external rollout gates where not yet recorded as passed.
