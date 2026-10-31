# Dev Toolbox redesign plan

Date: 2026-10-30. Status: workspace structure and launch behavior confirmed; visual direction remains proposed. No UI implementation.

Redesign Dev Toolbox as a compact desktop workspace for creating, checking, and reusing developer outputs. Give Task Generator, XAML Formatter, and barcode/QR generation equal attention. Include future roadmap screens without presenting them as available features.

## Review basis

Method: independent design and technical assessments, followed by synthesis. Assessment A inspected the running Tauri app, version 0.2.0, in its current dark theme: Tasks, XAML Formatter, Single and Multi code generation, populated code history, and About and updates. Assessment B inspected source and ran `impeccable detect --json src`, which returned `[]` and exit code 0. The mechanical scan does not cover all the usability and accessibility issues below.

Mobbin searches returned internal errors, including a retry. No reference screens were available to inspect or cite. This proposal therefore draws from the actual app and Impeccable guidance; a Mobbin comparison remains pending.

The review did not save tasks, generate new persistent history, delete records, import/export files, install updates, or change settings. Light theme, compact windows, measured contrast, and runtime performance remain validation work. One temporary unsaved task example was cleared. The app was left on Task Generator.

## Current design assessment

The tools contain useful developer behavior, but the layout mostly presents generic full-height cards. The strongest opportunity is to make the working content and resulting artifacts carry the interface.

| Heuristic | Score out of 4 | Main observation |
|---|---:|---|
| System status | 2 | Saving and generation need explicit busy, success, stale, and failure states |
| Language | 3 | Branch/PR terms fit; Code Generator and Multi are less specific |
| Control and freedom | 2 | Resize/reset work; formatter lacks Clear and delete has no recovery step |
| Consistency | 2 | Shared components; history placement and local navigation vary |
| Error prevention | 1 | Empty task still offers Save and copyable punctuation |
| Recognition | 3 | Labeled tool navigation; task labels disappear after entry |
| Efficiency | 2 | Batch, search, copy, and resizing help; shortcuts are mostly undisclosed |
| Minimalism | 2 | Tall cards and secondary controls occupy substantial empty space |
| Error recovery | 2 | Updates explain failures; several other failures are raw strings or logs |
| Contextual help | 2 | Barcode hints exist; empty tasks and formatter need guidance |
| Total | **21/40** | Qualitative heuristic assessment, not a measured usability score |

### What should survive

- Three direct, labeled tool destinations; local operation and local data.
- Resizable input/result comparison, immediate task naming previews, and copy controls.
- Single and batch codes, Lines/JSON inputs, result search/filter/order, preview zoom, SVG/PNG export, and history reuse.
- Separate task and code-history JSON backups and existing saved records.
- Update status, retry, progress, release notes, and explicit installation/restart controls.

### Five priorities

1. **P1: make launch useful.** `/` currently has an empty outlet, observed in the app and confirmed in `src/router.tsx`. The user confirmed restoring a valid last-used tool, falling back to Task Generator. No launch overview is planned.
2. **P1: make actions reachable and named.** Task copy buttons are unnamed in the accessibility tree. Source uses nonfocusable clickable rows for tasks, history, and batch results. Add persistent field labels, semantic selection, visible focus, named actions, and keyboard operation. Keep row selection separate from row action buttons.
3. **P1: make results trustworthy.** Barcode source can retain an old image while caption/type reflect current input, and history saving is not gated on generation success. Store image, generated input, type, and export metadata as one successful result snapshot. Mark changed inputs as needing regeneration. Validate tasks, preserve drafts on failure, and expose saving/loading/error states. Confirm permanent deletion unless actual reversible storage is added.
4. **P2: reclaim working space.** Replace tall form cards, repeated card headers, large logo treatment, and stacked padding with compact pane toolbars and purposeful editor/result space. Keep comfortable text sizes and usable targets.
5. **P2: make reuse readable.** History currently leads with IDs, raw timestamps, and JSON. Lead with code type, input summary or batch count, readable time, preview, and Use again. Put raw JSON in Details. Distinguish first use, no search matches, loading, and load failure.

Frequent users are most affected by wasted space and hidden shortcuts. Keyboard and screen-reader users are affected by unnamed actions and mouse-only rows. New users encounter the blank launch screen and unexplained empty panels. The issue is local hierarchy and state handling, not an excess of top-level tools.

## Proposed workspace

The user confirmed a focused workbench with a collapsible local history pane. Keep history available beside the work when requested, and retain the user's pane visibility choice. History should not occupy a permanent third pane by default. Launch into the last-used supported tool, with Task Generator as the fallback on first use or when the remembered destination is invalid.

```text
Compact tool sidebar | Tool name, local tabs, primary action, History
                     | --------------------------------------------
                     | Inputs / source     | Result / output
                     |                    | Copy / export
                     | --------------------------------------------
                     | Contextual state and shortcut hint
```

Use existing routes `/task`, `/xaml`, and `/codes`. Rename visible Code Generator to Barcodes & QR and Multi to Batch. Keep Tasks and code history local to their tool; a unified global history is unnecessary for this redesign.

The sidebar gets a small icon and product name, three tool destinations, and a quiet utility footer for About/updates and appearance. An available update remains discoverable through a badge or notification. Avoid a new settings destination until it has real preferences to hold.

Retain drafts when moving among tools. Restoring history or applying extracted screenshot fields must not silently replace an existing draft. Use a replacement confirmation when needed; saving every keystroke into SQLite is not required.

## Current screens

### Tasks

Put persistent Task number, Task name, and Branch type labels together. Show branch and PR title as distinct monospace result rows, each with a named Copy action. For blank inputs, show a short example instead of `feature/-` and `: `. Enable Save and Copy only when the relevant required values are valid.

Provide one New task action. Saved tasks use compact selectable rows with issue key, title, type, and readable date. Selecting a saved task opens labeled read-only details with copy actions; Duplicate as new can populate an editable draft without adding editing of existing records. Search and sort stay with the list; import/export sit in a labeled overflow menu. Empty history explains that saving a task makes it reusable.

Suggested flow: enter metadata → inspect branch/PR → copy and/or save → see saved confirmation → reuse later. A save failure preserves entered text and offers retry.

### XAML Formatter

Use editor panes titled Input and Formatted output with a compact shared toolbar: Format, Copy output, Clear, and an OS-appropriate shortcut hint. Keep error messages outside copied output. Match editor theme to the shell. Retain resize, selection, and editor search.

Formatting is the existing capability. If adding XML well-formedness validation, describe it accurately and do not promise XAML runtime validation. Disable output actions until there is useful output; mark output stale when input changes.

The future Monaco migration belongs in the existing roadmap milestone. It should not block improving the current toolbar and states.

### Barcodes and QR

Use consistent local tabs: Single, Batch, History. On Single, place Type before its input so instructions follow the selected format. Explain EAN-13's supported 12-digit check-digit calculation and 13-digit validation. Keep Generate, result status, actual generated value/type, preview zoom, Copy, and SVG/PNG export distinct.

On Batch, preserve Lines and JSON modes and all existing result filtering/search/order. Explain that JSON may specify type per item; do not present an apparently editable shared type when it is ignored. Use a selectable result list and one larger preview. Keep row-level errors with row context and allow successful items to remain usable. Only show result-specific controls when results exist. Do not introduce ZIP or bulk-download promises without implementation scope.

History uses human-readable rows and a useful preview; Use again restores the matching Single/Batch draft. Show JSON under Details, preserve backup import/export, and protect replacement of unsaved drafts. Decide explicitly whether failed attempts belong in history; the recommended default records successful generation and displays failures in place.

### About and updates

Preserve the existing update state machine and explicit install/restart choice. Keep version and release information accessible from the shell utility area. Maintain the current useful pattern of plain-language errors, retry, and expandable technical detail. Do not redesign this into a large preferences area.

## Proposed roadmap screens

These screens become visible only when their functionality ships. Empty navigation slots and disabled future tools should not clutter the current release.

| Future capability | Proposed screen or flow | Boundary |
|---|---|---|
| Monaco and diff | Format and Compare tabs inside the XAML tool; Original/Modified editors, inline/split view, Swap, Copy, Ignore whitespace | Keep text when switching tabs; compare raw text without automatic formatting |
| Screenshot to task | Capture action in Tasks → paste/drop/choose image → local recognition progress/cancel → editable extracted fields → Apply to draft → existing save flow | Review before apply; no automatic save, cloud OCR, or persistent screenshot storage |
| Standalone MCP | A small setup/help surface with install/configuration guidance and the supported deterministic tool list | MVP remains a standalone server; do not invent a desktop connection dashboard, always-on status, or backend lifecycle control |
| Barcode fixture collections | A collections view associated with Barcodes & QR: scenario, seed, item count, expected validity, result list, JSON/CSV export | Activate only after fixture generation contracts exist; preserve existing barcode workflows |
| API test collections | A later dedicated workspace if confirmed: collection list, structured case editor, preview, validation, export | Meaning of test collections and API contracts remains an open product decision; do not assume a full API client, request runner, accounts, or cloud sync |

## Visual direction to confirm

Use precise desktop typography, clear pane boundaries, and a restrained semantic accent. A code-review workspace is a useful structural direction: source and result remain comparable, errors attach to their source, and completed output is inspectable before reuse. Another viable direction is a more familiar compact IDE-style workbench. Neither is an approved visual identity yet.

Starting design constraints for exploration: system UI sans; monospace for source, branch names, barcode values, and payloads; roughly 13–14 px body text; 18–20 px tool titles; consistent 4/8 spacing rhythm; 32–36 px desktop controls; restrained corner radii; surfaces separated by a small number of neutral levels. Use an accent for the primary action, selected navigation, and focus, with separate success/warning/error semantics. Exact palette and type values require light/dark review and contrast verification.

Functional transitions should be short, respect reduced motion, and explain state. Avoid decorative page entrances. Preserve the app icon as an available asset while reducing its workspace footprint; an icon redesign is not required.

## Delivery sequence

| Phase | Deliverable | Exit condition |
|---|---|---|
| 1. Resolve visual direction | Use the confirmed focused workspace, collapsible history, and last-tool launch; choose the visual direction and wireframe current tools and future integration points | Both empty and populated content fit; future capabilities remain clearly proposed |
| 2. Shared shell and states | Navigation, spacing/type tokens, pane toolbar, result rows, labels/focus, status/error patterns, launch destination | One consistent shell works in current desktop window sizes and both themes |
| 3. Current tools | Tasks, formatter, Single, Batch, and History redesigned using the shared patterns | Existing generation, copy/export, persistence, backup, and resize workflows remain functional |
| 4. Roadmap integration | Add Compare, capture review, MCP help, and collections alongside their actual feature milestones | Each new screen is backed by its shipped behavior; no speculative navigation |
| 5. Bounded verification | Inspect desktop and compact windows in both themes; fix findings together; one confirmation pass | Keyboard path, labels, focus, long content, empty/no-match/error/loading/stale states, and output integrity pass |

For implementation validation, include small and wide desktop windows, long issue titles and branch names, no history, populated history, no search matches, malformed XML, invalid EAN-13, invalid batch JSON, mixed batch success/failure, stale output after edits, failed local saves, canceled file dialogs, offline updates, and unsaved draft replacement. Verify packaged native shortcuts and file operations on the supported operating systems. Core workflows must operate with networking disabled; update failures must not block them.

Keep React/Tauri/SQLite and existing UI primitives. Introduce shared workspace components only where the screens actually repeat them. No new hosted backend, accounts, analytics dashboard, or database relocation is part of the redesign.

## Confirmed decisions

- Focused workspace with collapsible history.
- Restore the last-used supported tool, with Task Generator as fallback.

## Decisions before implementation

- Final visual direction and whether to start the implementation with a full-fidelity visual comp or directly in code. No workflow default has been stored.
- Test collection scope and any real need for desktop MCP configuration remain product decisions for their milestones.

The recommended first implementation slice is the shell plus one complete Task flow, followed by formatter and codes using the same components. This tests the common patterns before duplicating them across the app.
