# Changelog

## Unreleased

- Add local Jira screenshot capture through clipboard paste, PNG/JPEG selection, and drag/drop, with editable review before applying to the task form.
- Bundle English OCR assets for offline recognition; support progress, cancellation, retry, and bounded image sizes.
- Preserve optional Jira issue type separately from Git branch type, migrate existing task databases transactionally, and support legacy 1.0/current 1.1 task backups.

## 0.2.0 (unreleased)

- Add About & updates with current version, explicit update checks, release notes, download progress, install/restart, and retry controls.
- Notify once per app session when a background check finds an update; keep installation explicit and failed background checks quiet.
- Use Tauri's updater signature verification, including signed-version binding, and retain the existing app identity and data directory.
- Build signed updater packages and a complete stable-channel manifest for both macOS architectures and Windows MSI/NSIS. Verify generated artifacts with the native updater before release upload.
- Require one manual installation for users upgrading from 0.1.9. Later compatible releases can install through the app.

- Add focused regression tests for task names, XML/XAML formatting, barcode behavior, backup compatibility, and database retention across reopening.
- Validate all application version declarations and lockfile entries; provide `npm run version:set -- X.Y.Z` for intentional stable releases.
- Run native build/test validation for Windows x64 and macOS Apple Silicon/Intel on pull requests and `main`.
- Replace automatic patch releases after merged PRs with version-tag builds and a draft release after every required target passes.
- Document target verification, installation/upgrade checks, recovery, and repeatable performance baselines.

## 0.1.9

Existing application baseline before M0: Task Generator with local history/backups, Ace-based XAML/XML formatter, and barcode/QR generation with local history/backups. This entry records the starting point rather than reconstructing earlier release history.
