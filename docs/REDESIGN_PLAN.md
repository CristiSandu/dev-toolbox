# Dev Toolbox: Review workspace

Implemented 2026-10-31 following the user's selection of Review workspace. The user asked for a start page, recent history, a subtle icon sidebar, and more room for working content. The later request for icon dimensions similar to VS Code is reflected in 22 px glyphs, 44 px click targets, and a 64 px desktop rail.

## Implemented surfaces

| Surface | Result |
| --- | --- |
| Home | Three direct tool launchers and recent saved task/code records. Recent links open the corresponding record. Honest loading, empty and failed-load states. |
| Shared shell | Compact icon rail with tooltips, current-page indication and visible focus. Appearance and About live in the utility footer. Cmd/Ctrl+0 opens Home; 1/2/3 open the tools. |
| Tasks | Persistent labels, separate source/result panes, named copy actions, disabled incomplete output, save feedback, and optional history. Saved records remain read-only and separate from the unsaved draft; Use as draft supports reuse. |
| Screenshot review | Compact From screenshot action, local recognition and editable review before applying. Replacing an existing draft requires confirmation. |
| Text tools | XML/XAML and strict JSON formatting, large themed Monaco editors, copy/clear/shortcut controls, external errors and a stale-output notice. Compare keeps editable Original/Modified, split/inline, swap and whitespace controls. |
| Single codes | Format first, labeled input, accurate EAN instructions, immutable generated-value metadata and a stale-preview notice. Generation failure preserves previous usable output. |
| Batch codes | Lines/JSON input, per-item formats, successful results retained alongside contextual errors, searchable/filterable/sortable selection and shared preview/export controls. Results and errors survive tool switching. |
| Code history | Human-readable titles, format/value or batch input count, readable dates, safe reuse, confirmations for deletion, original JSON under Details, and unchanged backup contracts. |
| About and updates | Version, explicit check/install/restart actions, release notes, progress and retry remain supported in the shared visual system. |

Drafts and generated previews remain in memory during tool switching. They are not written into browser storage or advertised as surviving an app restart. Existing SQLite data, naming conventions, code formats, and JSON import/export structures were preserved. No new dependencies or speculative roadmap navigation were added.

## Visual system

Graphite/navy dark surfaces and cool white light surfaces, quiet blue selection, system UI typography and monospace for actual artifacts. Compact toolbars and thin pane boundaries leave working space to input and output. Responsive layouts stack work panes, reset split proportions when orientation changes, and allow normal vertical scrolling in narrow windows. The existing icon is retained using a small native asset rather than shipping the 1.4 MB original for a 32 px rail mark.

## Verification

- 44 tests passed, including batch validation, legacy backup restoration, history equality independent of JSON property order, readable history summaries, formatter precision, task conventions, diff synchronization, OCR and updater state behavior.
- TypeScript and production Vite build passed. The existing large Monaco bundle advisory remains.
- Native isolated preview checks exercised task save/reuse/copy, preserved drafts, recent links, XML formatting, editable diff, 12-digit EAN and invalid EAN, mixed-code batch partial success, literal JSON input, Code128 SVG copying and history reuse without extra records.
- Both themes and About were inspected. Compact windows were checked at 390 px without horizontal document overflow. Rendered rail targets measured 44×44 px with one active item.
- Impeccable's mechanical detector returned no findings. The independent finish review and its fix verdict are recorded under `.impeccable/review/`.

The native preview uses a separate test namespace; the installed release and user records were not replaced. Windows packaging, live update installation, destructive operations on user history, and native backup file round trips were not exercised in this run. See `.impeccable/review/validation.md` and `final-evidence.json` for the evidence scope and current final-review status.

## References and approval

The chosen comp and its recorded approval are `.impeccable/mocks/decision/review.png` and `.json`. The direction contract is `.impeccable/surfaces/src-app-tsx.md`; the original choice and seed excerpt are `.impeccable/research/concept-roll.txt`.

Mobbin searches failed twice with internal errors. No Mobbin reference screen was inspected or cited. The implementation uses the real app and the user-approved Impeccable direction. The initial pixel comparison used an invalid viewport; its historical diagnostic is explicitly superseded by the native/manual evidence and independent review, not relabeled as a passing pixel match.
