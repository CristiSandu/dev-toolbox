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
