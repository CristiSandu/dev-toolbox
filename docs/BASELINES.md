# M0 baseline and verification record

**Date:** 2026-10-30. **Source:** `ec3977a` plus the uncommitted M0 changes. **Application version:** `0.1.9`.

These are local observations, not cross-platform performance guarantees. Replace or append measurements when the first tagged candidate is available.

## Local environment

- Apple M4 Pro, arm64, 24 GiB memory.
- `sw_vers`: macOS 26.7, build 25G229; Node reports Darwin 25.6.0. Both are recorded as returned by the environment.
- Node `v24.19.0`, npm `11.17.0`, Rust `1.99.1`.
- Existing `package-lock.json` and `src-tauri/Cargo.lock`; no dependency refresh for M0. `tempfile` was already resolved in Cargo.lock and is now a direct test-only dependency.

## Formatter baseline

Run `npm run baseline:formatter`. The script creates reproducible XAML-like input with repeated `TextBlock` elements, records the first call at each size, then ten warm calls. Median is the mean of the middle two sorted warm samples. It checks that fixture content survives formatting.

| Input bytes | First call at that size | Warm median | Warm maximum | Warm samples |
|---|---|---|---|---|
| 100,064 | 2.06 ms | 0.86 ms | 1.15 ms | 10 |
| 1,000,064 | 10.64 ms | 8.79 ms | 10.41 ms | 10 |

This measures `vkbeautify` in Node, including neither Ace rendering nor WebView/editor interaction. The first 1 MB call occurs after the 100 KB runs and is not a fresh-process cold start. Use these figures for algorithm comparisons; measure actual editor responsiveness separately when migrating to Monaco.

## Installer and launch baseline

Native Apple Silicon packaging passed with `npm run tauri build -- --ci --target aarch64-apple-darwin --bundles app dmg -- --locked`.

- DMG: `dev-toolbox_0.1.9_aarch64.dmg`, **12,047,757 bytes**.
- Application: `dev-toolbox.app`, **22,381,441 bytes** summed across files, excluding directory allocation overhead.
- Output directory: `src-tauri/target/aarch64-apple-darwin/release/bundle/`.

Windows and Intel macOS measurements require their native candidates. The app was not installed/launched against personal app data for this measurement.

For repeatable launch measurements:

1. Use the same dedicated OS test account, installer, and representative database for before/after comparison. Record task/code-history counts and OS/hardware.
2. Fully quit the app. Time from launch until the Task Generator can accept input and its stored history is visible. Do not use process creation alone as the ready signal.
3. Record the first launch after reboot separately, then five fully quit/relaunch samples. Report the median and maximum; note OS file caches and trust prompts.
4. Record exact installer bytes and unpacked `.app` size (or installed directory size on Windows), naming the architecture and format. Avoid comparing a DMG to an unpacked application.

Launch timing and installed-application upgrade retention remain manual gates; the database reopen test does not prove them. No personal application data is modified by the automated tests.

## Verification status

- Clean `npm ci`: passes without dependency/lockfile changes; followed by passing version checks, JS tests, and production build.
- JS tests: 8 pass; task generation, XML/XAML fixtures, version mismatches/tag checks, version-setting behavior.
- Rust tests: 9 pass with explicit `aarch64-apple-darwin` target and `--locked`; EAN-13, Code128 sanitization, barcode SVG/PNG signatures, unsupported DataMatrix PNG, task/history backup round trips, malformed-backup rejection, database reopen retention.
- Frontend production build: passes; existing mixed static/dynamic import and large-chunk warnings remain. Bundle splitting is outside M0.
- Native Apple Silicon installer build: app and DMG pass with explicit target and locked dependencies.
- macOS release archive: verified that the executable retains mode `0755` inside the tar archive.
- Workflow static validation: Actionlint `v1.7.12` passes.
- Windows x64 / macOS Intel CI and native installation tests: pending; workflows are configured but have not been run remotely in this task.
- Tagged release rebuild and real upgrade from the preceding release: pending; no tag, release, or deployment was created during implementation.

## M1 updater verification — 2026-10-30

Source is the M0 commit `3dd05a1` plus uncommitted M1 changes; configured application version is now `0.2.0`.

- JS: 18 tests pass, including updater state/concurrency/failure handling and complete four-platform manifest assembly.
- Rust: existing 9 regressions and the native download/signature test pass. The native test accepts correctly signed bytes, rejects a changed payload, and rejects an announced version differing from its signed version.
- Signed production Apple Silicon app/DMG/updater archive builds successfully with locked dependencies. The opt-in native artifact test downloads and verifies the actual staged `0.2.0` archive against the committed production public key.
- Actionlint `v1.7.12` passes; the UI mechanical detector reports no findings. Existing Vite chunk/import warnings remain.

### Controlled install/restart check

Used packaged debug Rust builds with production-built frontend assets, a unique `com.sanduilie-cristian.dev-toolbox.m1-smoke-*` identifier, and a loopback update server. Temporary config overrides allowed HTTP only in the test app. Production config remains HTTPS-only with signature and signed-version verification enabled. Personal production app data was not read or changed.

1. Built a `0.2.1` candidate, signed its updater archive, and served a matching manifest.
2. Built/launched a `0.2.0` baseline with the same isolated identity and one pre-seeded task plus one code-history entry.
3. Confirmed the UI displayed installed `0.2.0`, notified about `0.2.1`, and showed the candidate's release notes. Later deferred installation and the task history remained usable.
4. Chose Update and restart. Observed download progress, actual app replacement, and a reopened app displaying `0.2.1` and up-to-date status. The installed bundle's `CFBundleShortVersionString` also reads `0.2.1`.
5. Compared all task/history database fields and timestamps before/after; both histories were identical.
6. Stopped the loopback server, performed a manual check, and verified a recoverable connection error with Check again. Quit the isolated app and stopped the server afterward.

This proves the local Apple Silicon replacement/relaunch/data-retention path. It does not establish GitHub HTTPS hosting, platform signing/notarization, release-build runtime trust on clean machines, Intel macOS, or Windows MSI/NSIS upgrade behavior. GitHub CLI is unauthenticated, so repository signing secrets and remote CI/release publication remain pending. No public release/tag was created.

### Controlled Windows install/restart check — 2026-10-30

Source: `86c78e7`. Host: Windows 10 Pro x64, build 19045. Tools: Node 22.19.0 and Rust 1.99.1, with the locked dependencies. Built packaged debug `0.2.0` and `0.2.1` NSIS/MSI installers with production frontend assets in a temporary source copy. Used the isolated identity `com.sanduilie-cristian.dev-toolbox.windows-smoke`, product name `Dev Toolbox Upgrade Check`, a throwaway signing key, and a loopback update feed. Only the temporary configuration enabled HTTP and substituted the public key; production configuration and versions were unchanged.

- NSIS: installed `0.2.0` per user, created one task and one code-history entry through the app's native commands, and saved complete record snapshots. Exercised the actual About & updates controls through the installed app's WebView debugging connection.
- Confirmed update availability and release notes, deferred with Later, then selected Update and restart. The native updater downloaded the signed `0.2.1` NSIS installer and automatically reopened the installed app. Its native version API returned `0.2.1`; the UI reported up to date.
- Compared every task/history field, including IDs, payloads, and timestamps, before and after: identical. The isolated database resolved to `%APPDATA%/com.sanduilie-cristian.dev-toolbox.windows-smoke/tasks.db`.
- Stopped the loopback feed and verified that a manual check produced a recoverable error. Closed and uninstalled the isolated NSIS app afterward; retained its test data for the MSI check.
- MSI: both signed versions built successfully. The baseline installation required elevation (the unelevated attempt returned MSI error 1925 / exit 1603); elevated installation passed. Launched the installed `0.2.0` MSI app, seeded another task/history entry, verified availability and deferral, and initiated the actual signed `0.2.1` MSI update. After the user approved UAC, Windows registered version `0.2.1`, the installed executable's file/product versions were `0.2.1`, and a new app process automatically opened.
- The MSI restart did not inherit the temporary WebView debugging connection. After observing the automatic restart, closed and reopened the installed app with that connection enabled. Its native version API returned `0.2.1`, the UI reported up to date, and all fields of both tasks and both code-history entries matched the pre-upgrade snapshot. A manual offline check also produced a recoverable error.
- Closed the isolated MSI app and stopped the loopback server after verification. Left the isolated MSI installation and test database available for inspection; removed the temporary private signing key.

Local evidence is under `%TEMP%/dev-toolbox-windows-upgrade/`: build logs, installer logs, loopback request logs, the check script, and before-upgrade record snapshots. This establishes the local NSIS and MSI install/update/restart paths, not a production release upgrade, publisher trust/SmartScreen behavior on a clean host, or GitHub HTTPS delivery. No production user data, public release, or tag was changed.
