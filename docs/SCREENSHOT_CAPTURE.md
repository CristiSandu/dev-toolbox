# Jira screenshot capture

On Task Generator, paste a screenshot with **Cmd+V** (macOS) or **Ctrl+V** (Windows). You can also select a PNG/JPEG with **Import Jira screenshot**, or drop one onto the dashed area. Ordinary text paste still works in inputs.

Review the extracted issue key and summary, correct uncertain text, choose a candidate if several keys are found, and select Jira issue type if it is only shown as an icon. **Apply to task form** replaces the form fields; **Save Task** is still a separate action. Cancel leaves the task form unchanged.

Jira issue type and Git branch type are independent. Bug suggests `bugfix`; other known types suggest `feature`. `hotfix` is always a manual choice. Manual task entry remains available.

## Local processing and limits

- English recognition uses Tesseract.js 6 with worker, WASM, and English model assets copied from locked npm dependencies by `predev` / `prebuild`. No OCR service, CDN, or first-run language download is used. Generated assets live in ignored `public/ocr/` and are included in the production frontend bundle (about 25 MiB before installer compression).
- Images are limited to 10 MiB, 16 megapixels, and 8192 pixels per side. PNG/JPEG dimensions are checked before decoding. Crop to the issue header for best results.
- One job runs at a time. Cancel, route changes, and the two-minute timeout terminate the recognition worker and its nested worker. Closing the dialog releases its image URL and in-memory image/text references.
- Screenshots and raw OCR text are never written to task history or application logs. Only the reviewed fields are persisted when Save Task is clicked.
- The app's separate update check still uses the network. Offline OCR does not imply the entire app never makes a network request.
- Browser file drops are enabled by disabling Tauri's native drop interception; see [Tauri window configuration](https://v2.tauri.app/reference/config/#windowconfig).

## Data compatibility

Opening a legacy database adds nullable `jira_issue_type` in a transaction and advances SQLite `user_version` from 0 to 1. Reopening does not repeat the migration. IDs, existing task fields, and code history remain intact; unknown future schema versions are rejected.

Task exports now use `version: "1.1"`. Imports accept `"1.0"` and `"1.1"`; missing Jira type is Unknown. Unknown backup versions and invalid Jira types are rejected before insertion. Imports are atomic, preserve timestamps, and assign fresh IDs. Code-history backup format remains `"1.0"`.

## Verification

- `npm test`: parser, multiline headings, multiple keys, uncertainty, single-letter project keys, malformed/oversized images, and existing JS regressions.
- `npm run test:ocr`: real local recognition of `tests/fixtures/jira-header.png`, a synthetic English issue header containing no user data. This is a smoke test, not evidence of accuracy on real Jira layouts.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`: legacy migration, repeat opening, future-version rejection, backup compatibility, metadata round-trip, invalid imports, and existing native tests.

Before release, check at least 10 representative redacted Jira screenshots (light/dark themes, cropped and multiline headings, multiple related keys). Record exact key matches, usable summaries, failures, and cold/warm time. The roadmap's 90% clear-image target remains unmeasured until that set exists. Check packaged Windows clipboard paste, file selection, drag/drop, cancellation, and offline first-run recognition; CI compilation alone does not establish clipboard behavior.

Tesseract.js and its core are Apache-2.0; the bundled English trained data comes from `@tesseract.js-data/eng` (Apache-2.0). The asset preparation script includes the upstream engine license notices.

Local development verification (2026-10-30): 27 JS tests and 13 native tests passed; one existing signed-release-artifact test is intentionally ignored without release artifacts. The synthetic OCR smoke took 427 ms on this Apple Silicon Mac. A separately identified packaged debug app successfully selected the fixture, recognized it using bundled assets, applied/saved the reviewed fields, and recognized the same image pasted from macOS Preview. No real-layout accuracy percentage, Windows interactive result, or measured peak memory is claimed.
