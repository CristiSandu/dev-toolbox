# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The interface is React rendered inside a Tauri desktop shell. Desktop use is primary; the existing UI also has narrow-window layouts. The web value describes the interface technology, not a hosted product.

## Users

Personal use by a developer doing recurring development tasks. The user confirmed that the redesign should balance all three current tools.

## Product Purpose

Dev Toolbox brings recurring developer utilities into one offline-first desktop app: derive branch names and PR titles from task metadata, format and compare text, and generate barcode/QR images.

## Operating Context

Local desktop workflows on macOS and Windows. Generated branch names, PR titles, formatted text, and barcode images are used outside the app. Local SQLite stores tasks and code-generation history. JSON import/export supports moving and backing up those records. Update checks require internet; core utilities should remain local.

## Capabilities and Constraints

- Current version declarations in this checkout: 0.3.0.
- Home: direct tool launchers and recent saved tasks/code generations, with links to the corresponding records. Drafts remain in memory while switching tools.
- Tasks: feature/bugfix/hotfix branch types, generated branch/PR text, copy, save, search, date sort, read-only saved details, delete, JSON import/export.
- Text tools: Monaco split input/output editors, XML/XAML syntax checks and formatting through vkbeautify, strict JSON formatting that preserves numeric precision and key order, resizing, editor search, and a Cmd/Ctrl+Shift+F format shortcut. Raw-text diff supports split/inline comparison and whitespace handling. Do not describe XML checks as XAML semantic validation.
- Screenshot to task: local screenshot recognition with editable review of extracted Jira fields before applying them to the task draft.
- Codes: QR Code, EAN-13, DataMatrix, Code128; single and batch input; batch lines and per-item JSON; searchable generated results; preview sizing; SVG/PNG export and copy; SQLite history with restore, delete, JSON import/export.
- About and updates: installed version, explicit checks, release details, progress, retry, and explicit update/restart action.
- The existing React/TypeScript, Tailwind, Radix/shadcn, Tauri/Rust, and SQLite implementation is the technical baseline.
- Preserve existing data, generation conventions, code formats, and backup compatibility during redesign.

## Proposed Roadmap

The user requested that the redesign plan include proposed roadmap screens. These are proposals, not current capabilities:

- Standalone deterministic MCP utilities.
- Fixture/test collections, followed by API test collections when their requirements are settled.

DEV_TOOLBOX_ROADMAP.md contains implementation scope and release dependencies. Its original starting-point summary predates the current checkout; current source takes precedence for implemented features.

## Brand Commitments

Existing product name: Dev Toolbox. Preserve the app icon; the navigation rail uses a small copy of the existing native icon at src/assets/app-icon-rail.png.

The user approved Review workspace on 2026-10-31 and requested implementation across all pages: graphite and navy dark surfaces, cool white light surfaces, quiet blue selection, system UI type, and monospace for actual artifacts. Both themes remain supported, with system appearance as the initial preference. The user requested sidebar icon dimensions similar to VS Code; use 22 px glyphs in 44 px targets and a 64 px desktop rail.

## Evidence on Hand

- Running Tauri app inspected through native UI automation on 2026-10-30.
- Isolated native redesign preview inspected on 2026-10-31, including real test-history writes, reuse, generation, copy, XML formatting, raw diff, and both themes. Narrow-window web layouts were inspected at 390 px.
- Current source, README.md, DEV_TOOLBOX_ROADMAP.md, and docs/BASELINES.md.
- Mobbin reference searches failed with internal errors, including one retry. No Mobbin screens were available to inspect or cite.

## Product Principles

- Keep recurring tasks quick to reach and complete.
- Give all three current tools a consistent level of design attention.
- Keep core processing local and preserve user data.
- Distinguish available functions from roadmap proposals.
- Make generated outputs easy to inspect and reuse.

## Confirmed Workflow Decisions

- Use a focused workspace with collapsible history.
- Launch into a start page with direct tool selection and recent activity. The user's 2026-10-31 request replaces the earlier last-used-tool launch decision.
- Use a subtle icon sidebar with larger targets and more space for working content.

## Open Decisions

- Priority among future roadmap milestones beyond the existing implementation plan.
- Whether MCP needs desktop configuration UI; the current roadmap proposes a standalone MVP and defers a dashboard.
- Whether test collections primarily serve barcode/scanner fixtures or API testing.
