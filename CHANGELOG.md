# Changelog

## Unreleased

- Add focused regression tests for task names, XML/XAML formatting, barcode behavior, backup compatibility, and database retention across reopening.
- Validate all application version declarations and lockfile entries; provide `npm run version:set -- X.Y.Z` for intentional stable releases.
- Run native build/test validation for Windows x64 and macOS Apple Silicon/Intel on pull requests and `main`.
- Replace automatic patch releases after merged PRs with version-tag builds and a draft release after every required target passes.
- Document target verification, installation/upgrade checks, recovery, and repeatable performance baselines.

## 0.1.9

Existing application baseline before M0: Task Generator with local history/backups, Ace-based XAML/XML formatter, and barcode/QR generation with local history/backups. This entry records the starting point rather than reconstructing earlier release history.
