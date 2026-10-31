# Dev Toolbox — Next Features Delivery Plan

**Prepared:** 2026-10-30  
**Status:** M0–M3 implemented locally; remaining platform and release checks are recorded in [screenshot capture](docs/SCREENSHOT_CAPTURE.md) and [Monaco verification](docs/MONACO.md).
**Starting version:** `0.1.9`  
**Planning assumption:** One developer, macOS and Windows desktop, offline-first use.

## 1. Recommendation

Ship one substantial feature per release:

1. Establish regression checks and a reliable release process.
2. Ship in-app updates so later releases are easier to install.
3. Add local screenshot-to-task capture.
4. Replace Ace with Monaco and add text diff.
5. Expose a small set of deterministic utilities through MCP.
6. Expand into test cases and API collections after the MCP foundation works.

This preserves the attached roadmap's goals while separating Monaco and OCR, which have independent packaging and performance risks. The version numbers below are proposed release boundaries, not deadlines. Per the requested order, screenshot capture is M2 (`v0.3.0`) and Monaco is M3 (`v0.4.0`). Release versions remain proposed boundaries.

## 2. Verified starting point

Reviewed the local checkout, including existing uncommitted changes, rather than relying only on the original public-repository summary.

| Area | Current implementation | Planning consequence |
|---|---|---|
| Versions | `package.json`, `src-tauri/Cargo.toml`, and Tauri config say `0.1.9` | Keep both lockfiles synchronized when releasing |
| Release workflow | `.github/workflows/release.yml` bumps a patch after a merged PR, tags it, builds Windows/macOS, and publishes a release | Add an intentional minor-release path, PR validation, and explicit architecture coverage |
| Tests | No test script in `package.json` | Establish focused tests before changing behavior |
| Updates | Updater/process plugins and updater config are absent | Existing `0.1.9` installations need one manual upgrade |
| Persistence | `src-tauri/src/db.rs` resolves `tasks.db` under `BaseDirectory::AppData` | Preserve app identifier/path and verify real upgrade retention; no database relocation needed |
| Schema | Tables are created with `CREATE TABLE IF NOT EXISTS`; no migration version tracked there | Add a migration mechanism only when OCR adds persistent metadata |
| Task generation | Branch/PR derivation lives in `src/pages/TaskGenerator.tsx` | Extract existing behavior before sharing it with MCP |
| Formatter | Ace + `vkbeautify` in `src/pages/XamlFormatter.tsx` | Change the editor separately from formatting behavior |
| Barcodes | Rendering and core encoding rules live in Rust | MCP fixture values do not require porting image rendering |
| App shell | Three routes, existing sidebar/header, theme components and UI primitives | Add About/Updates using current patterns |
| CSP | `app.security.csp` is currently `null` | Test a suitable policy with locally bundled workers; avoid a CDN dependency |

This is a planning review, not a full code audit. CI runs, signing credentials, installed applications, and real device behavior were not verified.

## 3. Scope and working rules

- Keep manual task entry, task/code history, barcode generation, SVG/PNG export, and JSON backups working throughout.
- Keep formatting, OCR, fixture generation, and MCP utilities usable without internet. Update checks naturally need connectivity.
- Add no hosted backend, accounts, or model-provider integration for these milestones.
- Reuse existing components. Extract shared logic when a second caller actually needs it.
- Keep one milestone in progress. Split work into reviewable changes; do not combine editor migration, OCR, and database changes in one PR.
- Treat estimates as engineering effort, including focused checks and a release smoke test. Waiting for credentials, certificates, external reviews, or access to test hardware is additional.

## 4. Milestones and effort

| Milestone | Release | Priority | Effort | Prerequisite | User-visible outcome |
|---|---|---|---|---|---|
| M0: Release foundations | Before `v0.2.0` | P0 | 2–3 days | None | Safer builds and preserved data |
| M1: In-app updater | `v0.2.0` | P0 | 4–6 days | M0 | Check, download, install, and reopen |
| M2: Screenshot-to-task | `v0.3.0` | P1 | 5–8 days | M0; ship after M1 | Review extracted Jira fields before saving |
| M3: Monaco + diff | `v0.4.0` | P1 | 3–5 days | M0; ship after M2 | Offline XML/XAML editing and comparison |
| M4: MCP MVP | `v0.5.0` | P2 | 4–6 days | M0 and stable reusable utility contracts | Coding agents can invoke local tools |
| M5: Test collections | `v0.6.0` | P2 | 4–7 days | M4 | Export structured QA cases and API collections |

**Base effort:** 22–35 engineering days. Reserve roughly 25% contingency: **28–44 days total**, approximately 6–9 full-time weeks or 14–22 weeks at two engineering days per week. Re-estimate after the updater and OCR feasibility checks. No calendar dates are committed without knowing availability.

## 5. M0 — Release foundations

**Outcome:** Every later milestone has a repeatable build and a small regression safety net.

**Implementation status (2026-10-30):** Automated foundations are implemented: target matrix, PR/native validation, focused regression tests, synchronized version commands, tag-triggered draft releases, changelog, and release/upgrade documentation. Local JS/Rust checks and Apple Silicon app/DMG packaging pass; formatter and installer baselines are recorded in [docs/BASELINES.md](docs/BASELINES.md). M0 is not fully signed off: remote Windows/Intel CI, real installation-upgrade retention, launch timing, and a tagged rebuild still require verification. Follow [docs/RELEASING.md](docs/RELEASING.md).

- [ ] **FOUND-01 — Decide supported targets.** Proposed matrix: Windows x64, macOS Apple Silicon, macOS Intel. Set explicit Rust targets; runner OS alone does not establish architecture coverage. If Intel cannot be built and tested, document it as deferred rather than supported.
- [ ] **FOUND-02 — Validate PRs.** Run `npm ci`, `npm run build`, focused JS tests, and `cargo test --locked --manifest-path src-tauri/Cargo.toml`. Validate native builds on supported platforms before publishing. Add one small JS test runner if needed.
- [ ] **FOUND-03 — Capture existing behavior.** Extract task-name derivation without changing its output. Test current branch/PR conventions, representative XML formatting, EAN-13 check digits, and task/history export-import round trips using temporary databases/files.
- [ ] **FOUND-04 — Make releases intentional.** Replace the automatic patch-on-every-merge policy with a documented release PR/version bump followed by a tag-triggered release. Keep all three version declarations and both lockfiles consistent. Build from the tag; publish only after all required targets succeed.
- [ ] **FOUND-05 — Record data and performance baselines.** Create representative task/code history, export backups, record installer size, cold launch, and formatting latency. Note test machine and sample size.

**Done when:** A clean checkout passes the new checks; a release can be built from its tag; version mismatch fails validation; an installation upgrade preserves both histories. Add a short changelog and release checklist.

## 6. M1 — In-app updater (`v0.2.0`)

**User story:** I can check for an update and install it without finding an installer manually.

**Implementation status (2026-10-30):** Updater/process integration, About & updates controls, background notification, operation locking/progress/retries, signed multi-target staging, and complete manifest assembly are implemented. Versions are synchronized at `0.2.0`. A controlled Apple Silicon `0.2.0 → 0.2.1` install/relaunch retained both histories; signed production archive verification and tamper/version-rejection tests also pass. [Updater setup](docs/UPDATER.md) and [verification evidence](docs/BASELINES.md) record the remaining gates: GitHub signing secrets/authentication, remote CI/HTTPS publication, platform trust/signing setup, Intel macOS, and Windows MSI/NSIS upgrades. M1 is not yet cleared for broad distribution.

Use the official Tauri updater and process plugins. The updater supports signed artifacts and a static JSON endpoint; configure the supported platform entries and follow its installation/restart behavior. [Tauri updater documentation](https://v2.tauri.app/plugin/updater/)

### Delivery tasks

- [ ] **UPD-01 — Prove distribution first.** Produce two internal versions and complete one real signed update on macOS and Windows before polishing UI. Verify installed-path permissions and the selected Windows installer mode.
- [ ] **UPD-02 — Add native integration.** Register plugins in `src-tauri/src/lib.rs`, add required dependencies/capabilities, configure the public updater key and HTTPS manifest endpoint, and enable updater artifacts.
- [ ] **UPD-03 — Publish complete releases.** Store private signing material in CI secrets, with a secure recovery copy. Generate installers, updater packages, signatures, and one complete `latest.json`. Publish assets before making the stable manifest available; keep prereleases out of the stable update channel.
- [ ] **UPD-04 — Add About/Updates.** Show current version, Check for updates, release notes, download progress, retry, and install/restart controls. A background check may notify once per session; installation requires an explicit click. Avoid concurrent checks/installations.
- [ ] **UPD-05 — Exercise failure/recovery paths.** Cover offline checks, no update, missing target, failed download, invalid signature, deferral, and successful relaunch. Confirm tasks and code history survive.

**Acceptance scenario:** Install `0.2.0` manually with populated history, publish a controlled `0.2.1`, discover it in the app, install it, reopen, and verify the version and both histories. Test every supported target before advertising support.

**Release decision:** Updater signatures and operating-system signing are separate. Confirm the macOS signing/notarization path and Windows trust experience during UPD-01; include certificate setup/waiting separately in scheduling. The official updater requires cryptographic signing. [Tauri signing guidance](https://v2.tauri.app/plugin/updater/#signing-updates)

**Recovery:** Keep the previous installer available and document backup/restore. Do not promise automatic downgrade. Preserve `com.sanduilie-cristian.dev-toolbox` and the existing app-data location.

## 7. M2 — Screenshot-to-task (`v0.3.0`)

**User story:** I paste a Jira screenshot, review the suggested issue fields, and save using the existing task flow.

### Feasibility gate — first day

Try local OCR against 10–20 redacted representative screenshots, covering the actual Jira layouts used. Measure cold/warm recognition, field accuracy, memory, and packaged offline behavior on macOS and Windows. Include clipboard-image paste and file input in this check.

Start with `tesseract.js`, English assets, and one reusable worker. Its browser worker/core/language assets need explicit local paths for offline use. Use the selected version's API rather than copying old examples verbatim. [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)

If key/summary extraction is unreliable on the agreed clear-image subset, narrow supported layouts or investigate native OCR before completing the feature. Do not replace local OCR with a cloud service implicitly.

### Delivery tasks

- [ ] **OCR-01 — Accept images.** Add paste, PNG/JPEG selection, and drag/drop in Task Generator. Preserve normal text paste. Verify Tauri file-drop behavior on both platforms; file selection remains a fallback.
- [ ] **OCR-02 — Run recognition locally.** Bundle all worker/WASM/language assets. Show progress, allow cancel/retry, prevent overlapping jobs, and enforce decoded pixel and file-size limits. Release image buffers/object URLs when finished.
- [ ] **OCR-03 — Extract candidates.** Separate image recognition from a pure parser. Use text positions/headings to suggest key and summary; handle multiline summaries and multiple keys. A regex is only a candidate finder; account for single-letter project keys, for example `\b[A-Z][A-Z0-9]*-\d+\b`, without silently rewriting uncertain matches.
- [ ] **OCR-04 — Review before applying.** Show candidates and uncertainty in editable fields. Apply only after confirmation; never overwrite an existing form silently. Do not auto-save. A type shown only as an icon remains Unknown/manual.
- [ ] **OCR-05 — Preserve type semantics and data.** Keep Git `feature_type` separate from optional `jira_issue_type`. Suggest Bug → `bugfix`, Story/Task/Epic → `feature`; keep `hotfix` manual. Add a transactional, versioned, repeat-safe nullable-column migration. Update Rust queries/serialization, command arguments, TypeScript types, task display, and exports together.
- [ ] **OCR-06 — Test compatibility and privacy.** Import legacy `version: "1.0"` task backups with missing Jira type. Define the new export version and supported import versions explicitly. Preserve code-history backups. Use redacted fixtures and keep screenshots/OCR text out of persistent history and logs by default.

**Proposed quality target:** On at least 10 agreed clear screenshots, extract the issue key exactly and produce a usable summary on at least 90%. Report the fixture count and failures; this is a release target, not a promised OCR capability. Ambiguous/non-Jira images must remain reviewable or return no match. Agree a latency target after the feasibility measurement.

**Done when:** Paste/select/drop works in packaged builds, a clear screenshot becomes a reviewed task, uncertain fields remain editable, cancel leaves existing text intact, and first-run recognition works offline with no cached downloads. Migration/import checks pass on old data.

**Deferred:** Jira authentication/API lookup, icon classification, multiple OCR languages, screenshot storage, and native OCR unless the feasibility gate requires it.

## 8. M3 — Monaco formatter and diff (`v0.4.0`)

**Implementation:** Local Monaco Format/Diff is implemented. See [usage and verification](docs/MONACO.md); Windows/Intel interaction and large-document UI checks remain release gates.

**User story:** I can format XAML/XML and compare two texts without leaving the toolbox.

### MVP

- Format tab with editable input, read-only output, Format, Copy, and Clear.
- Diff tab with editable Original/Modified, side-by-side/inline toggle, copy per side, Swap, and Ignore whitespace.
- Existing route remains `/xaml`; theme and resizing follow the current app.
- `Cmd/Ctrl+Shift+F` formats; editor search and keyboard navigation remain available.

### Delivery tasks

- [ ] **FMT-01 — Package Monaco offline.** Verify React 19 compatibility for selected versions. Configure `@monaco-editor/react` to use the installed Monaco instance and Vite-bundled workers. The wrapper documents a local-package configuration; do not leave its CDN loader as the runtime path. [Monaco React local-package setup](https://github.com/suren-atoyan/monaco-react#use-monaco-editor-as-an-npm-package)
- [ ] **FMT-02 — Preserve Format behavior.** Keep `vkbeautify` initially. Add separate XML well-formedness validation and clear errors; do not imply XML validation checks XAML runtime semantics. Show errors outside copied output and preserve the user's input.
- [ ] **FMT-03 — Add raw-text diff.** Make whitespace ignoring an explicit option. Do not format either side automatically. Changing tabs must not discard text.
- [ ] **FMT-04 — Verify and remove Ace.** Check packaged offline startup, theme, shortcuts, resizing, tab state, and XML fixtures. Compare 100 KB and 1 MB samples against M0. Set a usable file limit or warning if needed; lazy-load the editor route. Remove Ace dependencies/imports after parity is verified.

**Done when:** A packaged app launched with networking disabled can format and diff; identical inputs show no changes; edits appear correctly; malformed XML yields a useful error without losing input; other routes do not pay unnecessary editor startup cost.

**Deferred:** YAML formatting, Git integration, multi-file comparison, custom language servers, and advanced editor preferences. JSON formatting was added alongside XML/XAML after M3.

## 9. M4 — Standalone MCP MVP (`v0.5.0`)

**User story:** My coding assistant can call Dev Toolbox utilities while the desktop app is closed.

MCP supplies the tool interface. The MVP runs deterministic functions; it does not add an AI model or promise to infer a comprehensive QA strategy from prose.

### Small initial tool set

| Tool | Input | Output and boundary |
|---|---|---|
| `generate_branch_name` | Issue key, summary, branch type | Branch and PR title matching the desktop conventions |
| `generate_test_fixtures` | Barcode kind, count, seed, scenario options | Reproducible values, expected validity, reason, and validation scope; JSON first |
| `validate_generated_data` | Tagged fixture payload | Schema/rule violations with item paths; no filesystem or network access |

Start fixture support with EAN-13, where check-digit behavior is explicit, then expand to Code128/QR/DataMatrix with documented rules. Distinguish encoding validity from application rules. Arbitrary text can be valid QR data; do not invent an invalid-QR case or equate length tests with scanner readability. Image generation stays in the Rust desktop implementation.

### Delivery tasks

- [ ] **MCP-01 — Agree contracts.** Define supported kinds, seed behavior, validation scope, and maximum counts/output bytes before implementation. Extract task generation and only the pure functions shared by the two consumers.
- [ ] **MCP-02 — Add minimal packages.** Use npm workspaces for `packages/toolbox-core` and `packages/mcp-server` when needed. Keep `src/` and `src-tauri/` in place; do not restructure every feature.
- [ ] **MCP-03 — Implement stdio tools.** Select and pin compatible released SDK/schema versions. The official TypeScript SDK currently identifies v2 (`@modelcontextprotocol/server`) as its stable line; confirm the release and API again at implementation time. [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [ ] **MCP-04 — Bound and validate.** Enforce input schemas and resource limits, use stdout only for protocol traffic and stderr for diagnostics, and return useful tool errors. No arbitrary commands, implicit disk writes, credentials, or desktop-database access.
- [ ] **MCP-05 — Prove installation.** Test a packed CLI artifact from a clean directory, initialization, tool listing/calls, bad inputs, and termination. Document Node requirements and a version-pinned command. Validate in MCP Inspector and at least one real client, then document VS Code/Cursor examples against their actual config formats.

**Done when:** A clean client starts the server without the Tauri app, discovers the tools, reproduces fixture output from a seed, rejects invalid inputs, and exits without orphaned processes. Desktop/core parity checks protect shared conventions.

**Deferred:** HTTP transport, hosted MCP, one-click bundled runtime, MCP settings dashboard, barcode images, and database read/write tools. Expose `format_xaml` only after choosing a parser/formatter that works consistently in Node and the desktop.

## 10. M5 — Test cases and API collections (`v0.6.0`)

**Working assumption:** “Test collections” means both scanner/barcode fixture sets and API test collections. Prioritize the former if scanner/QA workflows are the actual need; this decision does not block M0–M4.

- [ ] **TEST-01 — Make fixture collections useful in the app.** Let the Code Generator consume shared fixture output through its existing batch workflow. Add collection JSON/CSV export, seed/scenario metadata, and documented expectations. Keep current history payloads readable.
- [ ] **TEST-02 — Add structured case templates.** Accept explicit scenarios, inputs, expected results, and supplied criteria. Return structured cases and optional Gherkin. Make any suggested boundary cases traceable to rules; use the caller's AI for interpretation rather than adding a hidden model dependency.
- [ ] **TEST-03 — Generate an API collection.** Accept explicit endpoints, methods, parameters/body examples, auth placeholders, and expected status codes. Export Postman Collection v2.1 JSON as the interoperability target. Use `{{baseUrl}}`, keep secrets out, and produce negative cases only from supplied constraints.
- [ ] **TEST-04 — Validate beyond JSON shape.** Check against the chosen official collection schema, import the result in the intended Postman workflow, and execute assertions against a controlled local mock. Schema validity alone does not prove a useful test suite. Verify the installed CLI's supported import/run path before scripting it; its local executable is `/Users/sanducristian/.local/bin/postman`.
- [ ] **TEST-05 — Expose matching MCP tools.** Add `generate_test_cases` and `generate_postman_collection` only after the direct core functions and exports pass their checks. Reuse limits and error conventions from M4.

**Done when:** Fixture sets can be reused by the desktop and MCP, explicit cases export predictably, generated collections import successfully, and assertions detect a deliberately wrong mock response. Generation never calls a real API automatically.

**Deferred:** Publishing to Postman workspaces, running requests against production, scheduled monitors, broad OpenAPI import, and AI-generated requirements discovery.

## 11. Dependency and release gates

**Technical dependencies:** M0 → M1/M2/M3/M4; M4 → M5. OCR and Monaco do not depend on each other. M4 can extract branch logic independently of OCR. The recommended shipping order limits simultaneous work rather than inventing technical coupling.

Each release must satisfy:

- [ ] Relevant JS/Rust checks and native builds pass for the advertised targets.
- [ ] Manual smoke test: create task, copy branch/PR, format XML, generate barcode, reload histories, and export/import backups.
- [ ] New local features work in a freshly installed packaged app with networking disabled.
- [ ] Upgrade from the preceding supported release preserves both histories and the application identity.
- [ ] Version declarations/lockfiles, release notes, installer assets, signatures, and manifest entries agree.
- [ ] Failure messages have a recovery action; long operations remain cancelable or clearly bounded.
- [ ] Keyboard use, focus handling, theme contrast, and resizing work for new controls.
- [ ] Recovery instructions identify supported backups/installers. Schema changes do not imply safe downgrade to an old binary.

## 12. Decisions to settle at the right time

| Decision | Proposed default | Resolve by |
|---|---|---|
| Exact OS/architecture coverage and access to hardware | Windows x64 + both macOS architectures, only when tested | FOUND-01 |
| Release cadence | Explicit release PR and tag; patch hotfixes as needed | FOUND-04 |
| Platform signing and key custody | Set up before broad updater rollout | UPD-01 |
| OCR layouts/languages and acceptable latency | Actual Jira screenshots, English first; benchmark before setting latency | OCR feasibility gate |
| Meaning of “test collections” | Scanner fixtures first; API collections next | Before M5 |
| Node requirement for MCP clients | Documented local Node CLI first | MCP-05 |

## 13. First implementation batch

Start with **FOUND-01 through FOUND-04**, followed by **UPD-01**. The concrete first deliverable is a tagged build with passing regression checks and a demonstrated update between two internal versions. That evidence determines whether signing, packaging, or target support needs more time before committing to the remaining estimates.

Keep unrelated toolbox additions such as regex, UUID, Base64, multi-window support, and custom branch templates in a separate backlog. They are outside these releases.
