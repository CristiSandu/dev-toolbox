# Changelog

## Unreleased

## 0.3.2 (2026-11-01)

- Add a local stdio MCP server for saved Test Plans: projects, cases, ordered lists and products, Markdown descriptions, revision history, JSON import/export, image fetching, and barcode generation. Agent writes use the same validation, transactions, and revision conflict checks as the app.
- Add full-case and codes-only PDF export through the Node MCP entrypoint, including embedded PNG/JPEG product images and explicit counts for unavailable images and failed codes.
- Add Test Plans → MCP settings with detected executable paths, copyable client configuration, native/PDF tool selection, and a temporary connection check that verifies the MCP handshake.
- Open product preview and Markdown images in an enlarged, keyboard-accessible popup.
- Print values beneath codes in codes-only PDFs, preserving short values and shortening long payloads. Keep captions and titles centered in wide rows.
- Compact full-case PDFs with smaller description headings, tighter spacing, and bounded code sizing. Keep list headings with the following product and remove duplicate SVG value labels.
- Use the Node PDF engine for MCP exports so PNG images render without browser worker dependencies.

### Upgrade notes

- Keep the existing application identifier and data directory. This release adds no database migration or Test Plans JSON format change.
- MCP clients launch and own stdio server processes; the app's connection status reports a temporary check, not active agent connections. Agents can modify/delete saved plans and read/write import/export files. Unsaved app drafts are not exposed; reload saved cases after external edits.
- The MCP executable is currently built separately from the GUI installers. Build `dev-toolbox-mcp` and follow [MCP setup](docs/mcp.md). PDF-enabled MCP access additionally requires Node 22.12+, the source checkout, and npm dependencies. WebP/GIF product images are omitted from MCP PDFs and counted as unavailable.
- Smaller codes retain minimum module widths and quiet margins, but physical scanner readability and installer upgrade/data-retention checks still require verification on each release target before publishing.

## 0.3.1 (2026-10-31)

- Add Test Plans with projects, Markdown case descriptions, multiple product-code lists, revision history, and protection for unsaved changes.
- Preview product codes with corner image thumbnails, a hideable project explorer, and a full-screen code view. Show a live character count for encoded values.
- Share complete projects or individual cases through versioned JSON. Imports create new copies and preserve existing work.
- Export full case PDFs or compact codes-only sheets with titles beneath each code. Adaptive columns preserve proportions and clear code margins; invalid codes remain labeled.
- Add the workspace home screen with recent activity and tool shortcuts.

### Upgrade notes

- Test Plans adds SQLite tables while preserving existing tasks and code-generation history. Keep a closed-app database backup before upgrading or rolling back.
- Test-plan JSON shares source content and image URLs; local revision history and generated assets are excluded. Imported cases begin at revision 1.
- Product images require network access. PDF export labels unavailable images and failed codes. Print at actual size; physical printer/scanner verification remains required for your workflow.
- Native installation, upgrade/data-retention, and OS trust checks remain required on every advertised platform before publishing. Updater signatures do not replace platform signing/notarization.

## 0.3.0 (2026-10-31)

- Align Format and Diff toolbar layouts and editor surfaces, with matching panel headers, Copy actions, selectors, and Clear controls.

- Add a JSON format option with local Monaco highlighting/validation, two-space indentation, precision-preserving output, and the existing Copy/Clear/shortcut controls. Rename the tool to Text Formatter while retaining `/xaml`.

- Fix cursor jumps and undo loss when typing in the Original side of Diff; synchronize external changes only when the model text differs.

- Replace Ace with locally bundled Monaco XML editors, app theme support, search, copy, clear, and Cmd/Ctrl+Shift+F formatting.
- Add XML well-formedness errors outside copied output and preserve input/previous successful output on failure.
- Add raw-text Diff with editable sides, inline/split views, Swap, copy, and explicit leading/trailing whitespace handling. Lazy-load the editor route.

- Add local Jira screenshot capture through clipboard paste, PNG/JPEG selection, and drag/drop, with editable review before applying to the task form.
- Bundle English OCR assets for offline recognition; support progress, cancellation, retry, and bounded image sizes.
- Preserve optional Jira issue type separately from Git branch type, migrate existing task databases transactionally, and support legacy 1.0/current 1.1 task backups.

### Upgrade notes

- Existing task data is migrated to add an optional Jira issue type. Export task and code histories before upgrading; retain backups before rolling back to an older app.
- Screenshot recognition uses a bundled English OCR model; review extracted issue details before saving.
- Installer upgrade/data-retention checks remain required on each release target before publishing. Updater signatures do not replace platform signing/notarization.

## 0.2.0 (2026-10-30)

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
