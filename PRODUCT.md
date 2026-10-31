# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The interface is React rendered inside a Tauri desktop shell. Desktop use is primary; the existing UI also has narrow-window layouts. The web value describes the interface technology, not a hosted product.

## Users

Personal use by a developer doing recurring development tasks. The user confirmed that the redesign should balance all three current tools.

## Product Purpose

Dev Toolbox brings recurring developer utilities into one offline-first desktop app: derive branch names and PR titles from task metadata, format XAML/XML, and generate barcode/QR images.

## Operating Context

Local desktop workflows on macOS and Windows. Generated branch names, PR titles, formatted text, and barcode images are used outside the app. Local SQLite stores tasks and code-generation history. JSON import/export supports moving and backing up those records. Update checks require internet; core utilities should remain local.

## Capabilities and Constraints

- Current version declarations in this checkout: 0.2.0.
- Tasks: feature/bugfix/hotfix branch types, generated branch/PR text, copy, save, search, date sort, read-only saved details, delete, JSON import/export.
- XAML/XML: Ace split input/output editors, formatting through vkbeautify, resizing, editor search, and a Ctrl+Shift+F format shortcut. Do not describe formatting as XAML semantic validation.
- Codes: QR Code, EAN-13, DataMatrix, Code128; single and batch input; batch lines and per-item JSON; searchable generated results; preview sizing; SVG/PNG export and copy; SQLite history with restore, delete, JSON import/export.
- About and updates: installed version, explicit checks, release details, progress, retry, and explicit update/restart action.
- The existing React/TypeScript, Tailwind, Radix/shadcn, Tauri/Rust, and SQLite implementation is the technical baseline.
- Preserve existing data, generation conventions, code formats, and backup compatibility during redesign.

## Proposed Roadmap

The user requested that the redesign plan include proposed roadmap screens. These are proposals, not current capabilities:

- Monaco formatting and raw-text diff.
- Local screenshot-to-task capture with review before applying extracted fields.
- Standalone deterministic MCP utilities.
- Fixture/test collections, followed by API test collections when their requirements are settled.

DEV_TOOLBOX_ROADMAP.md contains implementation scope and release dependencies. Its original starting-point summary predates the current checkout; current source takes precedence for implemented features.

## Brand Commitments

Existing product name: Dev Toolbox. An app icon exists at src/assets/app-icon.png. No replacement identity, palette, typography, or final visual direction has been approved.

## Evidence on Hand

- Running Tauri app inspected through native UI automation on 2026-10-30.
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
- Restore the last-used supported tool on launch, with Task Generator as the fallback on first use or when the remembered destination is invalid.

## Open Decisions

- Final visual direction and any replacement brand treatment.
- Priority among future roadmap milestones beyond the existing implementation plan.
- Whether MCP needs desktop configuration UI; the current roadmap proposes a standalone MVP and defers a dashboard.
- Whether test collections primarily serve barcode/scanner fixtures or API testing.
