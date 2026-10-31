# Test Plans feature plan

Status: implemented locally. Automated checks cover parsing, Markdown rendering, persistence, migrations, and revision safety. The packaged macOS review app has also passed the native interaction checks documented in [TEST_PLANS_E2E.md](TEST_PLANS_E2E.md).

## Goal

Add a **Test Plans** tool where users organize projects, create test cases, and prepare reusable lists of product barcodes and QR codes. Each product can have a title and image URL. Selecting a product displays its large generated code alongside its image and title. Each test case keeps a readable change history.

## Working assumptions

- “New tab” means a new tool in the existing app navigation, at `/test-plans`, with the label **Test Plans**.
- A project is the container for a test plan. There is no additional plan entity between a project and its cases in the first version.
- Each project contains multiple test cases; each case contains multiple named code lists; each list contains product entries. A new case starts with one list named “Products”.
- A product entry has one encoded value and one code format. To test the same product with several formats, add separate entries.
- Both the project/case explorer and the selected-product preview are on the right: the explorer sits at the far right, and the preview sits immediately to the right of the product list.
- Image URL is an optional field. Product title is optional, with the encoded value used as the display fallback. Case title and list name are required; the case description field may be empty.
- Case descriptions are authored as Markdown and displayed as formatted content. Product descriptions remain plain text.

These choices make the request concrete and can be revised before implementation.

## Navigation and workspace

Add the tool to the navigation rail, Home tool listing, and the app shortcut map (`Cmd/Ctrl+4`). Keep the existing Barcodes & QR tool available.

The desktop workspace has three resizable panes:

1. **Case workspace:** case title with top-level **Description** and **Test List** tabs. Description shows the rendered Markdown with an Edit action; Test List shows the named code-list selector with add/rename/delete actions and the active list editor or generated product list on the left, with the product preview beside it. Editing switches the list area into edit mode so a permanent fourth pane is unnecessary. A separate History action opens the case revision viewer without adding another primary tab.
2. **Product preview, middle/right:** selected product title, large generated code and readable encoded value, with the product image beside the code. Include code format, product description if supplied, preview sizing, and existing SVG/PNG/copy actions. Exports apply to the code image only.
3. **Project explorer, far right:** collapsible projects with child test cases, similar to the VS Code file explorer. Selecting a project expands it and shows its case summary; selecting a case opens its full product workspace. Provide visible New Project and New Test Case actions plus rename/delete menus.

The explorer retains context while the product list supports scanning. The preview receives the strongest visual emphasis so the selected code stays easy to inspect and scan. Show history on demand to avoid competing with the main workflow.

The three-pane layout applies to **Test List**. **Description** uses the combined list/preview area for readable rendered Markdown while the explorer remains at the far right. Opening a case initially selects Description; switching to Test List reveals its products. Switching between these tabs retains the current draft, active list, product selection, and generated results.

### Markdown description

- Provide a Markdown source editor with Write and Preview modes within Description. Preview renders the current draft without requiring a save; outside editing, show the saved description as formatted content.
- Support headings, paragraphs, emphasis, ordered/unordered lists, task lists, links, blockquotes, fenced code blocks, and tables. Keep long code blocks and wide tables scrollable within the content area.
- Store the original Markdown string, not rendered HTML, so editing and revision history preserve the source exactly.
- Treat Markdown as untrusted content: disable raw HTML, reject executable link/image URL schemes, and use safe external-link handling. Render Markdown images only from absolute HTTP(S) URLs under the same image policy as product images, with alt text and a broken-image fallback.
- Empty descriptions show an Add description action. Markdown editing shares the case's Save Case action and dirty-state protection.

### Selection and resizing

- Selecting a case opens its Description tab. Test List displays every product in the active list, with clear list names and counts for the other lists. Initially select the first nonempty list and its first product when entering Test List.
- Product rows show thumbnail, title (or value fallback), encoded value, code format, and generation status. Clicking a row updates the preview without leaving the case.
- Search filters the active list by title, value, and description. Display visible and total counts. A filtered-out selection is cleared rather than silently showing an unrelated product.
- Preserve stable selection by IDs, including when entries have identical values. After deletion select the next available entry or show an empty state.
- Keep panes independently scrollable. On narrower windows, collapse the explorer into a right-side sheet and stack the image and code within the preview; at very narrow widths use a list/detail switch with a Back to products action.
- Support keyboard tree expansion/selection, labeled inputs and actions, visible focus, keyboard resizing where supported, descriptive image alt text, and live save/generation status. Context menus supplement visible controls.

## Main workflows

### 1. Create a project and test case

1. Open Test Plans and choose New Project.
2. Enter the project name and save it.
3. Choose New Test Case within that project.
4. Enter the case title and author its description in Markdown, checking the rendered preview.
5. Switch to Test List, add products to the first empty code list, generate codes, and save the case.

Allow project rename/delete and case edit/delete. Confirm deletion with the project/case name and affected content count. Project deletion removes its cases and their history in one transaction.

### 2. Build multiple product lists

Each list supports a row editor and bulk input similar to the current Batch tool:

- **Rows:** title, encoded value, code format, Image URL, optional product description; add/remove entries.
- **One per line:** enter values using a chosen common format; create rows, then fill in titles and image URLs in the row editor.
- **JSON:** import structured product rows with per-entry formats and image URLs. Use the existing Batch field names `text`, `type`, and `description`, plus `title` and `imageUrl`.

Example JSON input:

```json
[
  {
    "title": "Sample product",
    "text": "5901234123457",
    "type": "EAN-13",
    "description": "Standard package",
    "imageUrl": "https://example.com/products/sample.jpg"
  },
  {
    "title": "Product information",
    "text": "https://example.com/products/sample",
    "type": "QR Code",
    "imageUrl": ""
  }
]
```

- Preserve encoded values as strings, including leading zeroes. Require string `text` in this feature's JSON input rather than risking numeric precision loss.
- Reuse the existing supported formats: QR Code, EAN-13, DataMatrix, and Code128.
- Bulk input appends by default. An explicit Replace List action confirms replacement when the list has entries. Preserve duplicate entries and original order.
- Validate the entire bulk input before changing the draft. Show item-level problems and leave the existing draft intact on invalid input.
- Add, rename, and delete lists; confirm deletion of nonempty lists. Store explicit entry/list order; drag-and-drop reordering is outside the initial scope.

### 3. Generate and inspect products

- Generate the active list through the existing local barcode generator, with progress and protection against overlapping runs.
- Keep successful results visible when individual entries fail. Display failures beside their source products and allow retry after correction.
- Associate results with stable product IDs, never filtered row indexes. Discard late results when a case changes, a product changes, or the view unmounts.
- Changing encoded value or format immediately marks its previous result stale and prevents displaying/exporting that result as current. Changing title or image URL does not require regeneration.
- Generate stored entries on demand when reopening a case; cache generated images in memory rather than storing base64 images in the database.
- Save source rows even if a barcode cannot be generated, so intentionally invalid inputs can remain part of a test case. Distinguish saved data from successful generation.
- Image loading never blocks code generation. Missing, invalid, or unreachable images display a placeholder and retain the product title and code.
- Accept only absolute HTTP(S) image URLs with no embedded credentials; render images as images, never injected HTML. Use lazy thumbnails and no-referrer requests. Do not log full URLs, which may contain signed query parameters.
- Remote images require network access and may expire. Store the URL only; image downloading, local attachments, and offline image caching are outside this version.
- Implementation limits: 100 lists / 5,000 products per case, 2 MB total source content, 500 KB case Markdown, 32 KB per encoded value or product description, 200 characters per name/title, and 8,192 characters per image URL. The shared generator normalizes source values; this feature reports an error for values that would be changed, preserving the original test fixture instead of silently altering it.

### 4. Save and review changes

- Use explicit **Save Case** with a dirty indicator. Warn before switching case, closing an editor, or leaving the tool with unsaved changes; offer Save, Discard, and Cancel. Use the desktop close-request hook for the same protection on normal app close.
- One successful save creates one case revision when content actually changed. Creating the case creates its first revision. Generating codes, loading images, changing selection, and no-op saves create no revisions.
- Save the case content and its revision atomically. On failure retain the draft, report the error, and avoid a success state or a partial history entry.
- The History action opens a revision viewer listing revisions newest first with timestamp and generated change summary, such as “Updated description; added 3 products; changed 1 image URL”.
- Selecting a revision displays a read-only snapshot and field-level changes from the preceding revision, including case metadata, Markdown source changes, list changes, and product additions/removals/edits. Render historical descriptions with the same safe Markdown renderer used for the current description.
- History is per test case. It records local content changes, not pass/fail execution results or a multi-user audit trail. Restore from history is outside the initial scope.

## Data and persistence

Use the existing SQLite database (`tasks.db`) through Rust/Tauri commands. Add an incremental migration from schema version 1 to 2, preserving tasks and code-generation history. Update the existing future-version guard and migration tests to account for the new supported version.

Keep storage small: projects are rows; a case's nested lists/products are a versioned JSON document, also used for revision snapshots. No separate product tables are needed for the requested case-scoped operations.

| Record | Fields |
| --- | --- |
| `test_projects` | `id`, `name`, `created_at`, `updated_at` |
| `test_cases` | `id`, `project_id`, `content_json`, `revision`, `created_at`, `updated_at` |
| `test_case_revisions` | `id`, `case_id`, `revision`, `snapshot_json`, `changes_json`, `created_at` |
| Case content | `schemaVersion`, `title`, `descriptionMarkdown` (original source), ordered `lists` |
| Code list | stable `id`, `name`, ordered `products` |
| Product | stable `id`, `title`, `text`, `type`, `imageUrl`, `description` |

- Enforce parent relationships and transactional deletion; if using SQLite foreign-key cascades, enable foreign keys on every opened connection.
- Validate incoming content in Rust as well as the UI: required fields, supported formats, URL policy, unique nested IDs, and sensible document/input limits. Document the chosen limits in implementation.
- Use a case revision number in saves to reject stale writes rather than overwriting newer data silently.
- Keep revision snapshots append-only until their case/project is deleted. Timestamps use UTC storage and local display.
- Store only selection, explorer expansion, and pane preferences in draft/UI state. Durable project/case data belongs in SQLite.
- Existing task and code-history exports will not include this feature. Dedicated JSON project/case sharing is now included; see `TEST_PLANS_JSON.md`.

## Implementation map

| Area | Planned changes |
| --- | --- |
| Navigation | `src/router.tsx`, `src/components/app-sidebar.tsx`, `src/App.tsx`; verify Home/header consumers of the tool list |
| Workspace | New `src/pages/TestPlans.tsx` and focused components under `src/features/test-plans/` for explorer, case editor, list editor, product list/preview, and revision history |
| Shared generation | Reuse `src/lib/code-generation.ts`, existing code types, type normalization, and barcode export utilities; compose or minimally extend `CodePreview` for product context |
| Parsing and changes | Feature-specific product input validation and structured change comparison; keep legacy Batch JSON behavior compatible |
| Markdown | Shared case-description renderer for current content, draft preview, and historical snapshots; use a maintained React Markdown renderer with GFM support if no suitable dependency exists at implementation time; disable raw HTML and enforce safe URL handling |
| UI | Existing resizable panels, dialogs, inputs, tabs, sheets, empty states, and app CSS tokens |
| Persistence | New `src-tauri/src/test_plans.rs`; migration in `db.rs`; command registration in `lib.rs` |
| Checks | Focused TypeScript parser/change-summary tests and Rust persistence/migration tests using existing test conventions |

Suggested command surface: list/create/rename/delete projects; list/get/delete cases; save case with expected revision; list/get case revisions. Case creation uses the same validated save path with no existing case ID.

## Delivery steps

1. **Storage foundation:** schema migration, data contracts, validation, transactional CRUD and revision writes, persistence tests.
2. **Workspace shell:** navigation, right-side explorer, project/case management, empty states, selection, responsive panels.
3. **Products and codes:** multiple named lists, row/bulk entry, thumbnails, generation and product preview, existing code exports.
4. **Editing and history:** Markdown source editing and safe rendering, Description/Test List tab state, dirty-state protection, save feedback, change summaries, read-only revision viewer, stale-write handling.
5. **Verification:** targeted automated checks, production build, and desktop interaction review.

## Acceptance criteria

- Create two projects, each with multiple cases, and navigate between them through the far-right explorer.
- A case supports a title, Markdown description, and at least two independently editable named code lists.
- Opening a case shows top-level Description and Test List tabs. Description opens first and renders Markdown correctly, including tables, task lists, and fenced code blocks; Write/Preview supports editing without losing source formatting.
- Switching Description/Test List preserves unsaved edits, active list, selected product, and generation results. The product preview is visible only in Test List; the explorer remains available in both tabs.
- Markdown source survives saving, restarting, and revision history. Raw HTML and unsafe links/images cannot execute content.
- Bulk entry supports line input and mixed-format JSON; product titles and image URLs survive saving and reopening the app.
- Opening Test List shows the case's products; selecting a product shows its large current code alongside the correct image and title.
- Duplicate values remain separate products; selection remains correct after filtering and deletion.
- Invalid codes show local errors without hiding other products. Unavailable images show placeholders without breaking code preview.
- Editing a value/format invalidates its old preview; late generation results cannot overwrite another case or newer input.
- Every changed save produces exactly one revision with an accurate summary and inspectable snapshot. No-op saves do not.
- Failed saves preserve the draft and create no partial history. Unsaved navigation/close offers Save, Discard, and Cancel.
- Reopening the application preserves project/case content and history. Migration preserves existing tasks and code-generation history.
- Existing Single, Batch, and History code-generation flows remain compatible.
- Keyboard navigation, narrow windows, long values/titles, empty projects/cases, and light/dark themes remain usable.

Run `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml` during implementation. Add focused coverage for leading zeroes, malformed bulk input, image URL validation, Markdown rendering/unsafe content handling, Markdown source round trips, revision comparison, transactional save failure, deletion relationships, and migration/reopen behavior. Verify generated code, remote-image rendering, Description/Test List state retention, and rendered descriptions in the desktop app.

## Outside the initial scope

Test execution, pass/fail tracking, test steps/expected results, assignments, collaboration/cloud sync, an additional plan grouping level, revision restoration, attachments/offline image caching, drag-and-drop ordering. These can be planned separately if needed.

## Workspace and sharing follow-up

- Code preview fits the full available canvas without cropping, with an 80px product-image thumbnail in the top-right corner.
- Hide/show the Projects sidebar; open generated codes in a full-window dialog with Escape/Close to return.
- Export a saved project with all current cases, or just one case's current content (including draft edits). Resolve unsaved changes before project export.
- Import versioned JSON with a preview and destination project picker for single-case files. Create new copies, validate the entire document, and write project/cases/revision-1 snapshots in one transaction.
- Preserve Markdown and all source product fields. Keep local revision history and rendered assets out of portable content. See `TEST_PLANS_JSON.md` for the contract.

## Case PDF export

- Export PDF from the open case toolbar or an individual case's explorer menu.
- Include the current case content, including draft edits, all named lists, and all entries in source order, independent of the active list or search filter.
- Render Markdown as text with headings, emphasis, lists, tables, and code blocks. Include every product's title, type, full value, description, generated code, image, and image URL.
- Keep vector codes sharp, paginate long content, add page numbers, and embed fonts for Romanian and Cyrillic text.
- Preserve entries with generation/image failures; show clear fallback labels and a completion notice. Fetch common product-image formats locally with time/size limits, avoiding browser CORS restrictions.
- Offer progress and cancellation; write the PDF only after generation completes. PDF is for sharing/review; JSON remains the editable import format.

## Compact PDF pagination

Use up to four columns for smaller matrix codes, two for linear codes, and wider/full-width entries for dense symbols or lengthy metadata. Preserve aspect ratio, clear code margins, and legible module sizing. Flow descriptions/lists without forced new pages, keep compact entry rows together, and let long text paginate without truncation. Verify exports by decoding QR, EAN-13, Code128, and DataMatrix from rendered PDF pages at 150/300 DPI.

## Codes-only PDF

Add a Codes-only PDF action beside the full PDF export and in each case menu. Export all entries as generated codes with centered titles underneath, flattening list boundaries to pack rows. Omit visible case/list headings, descriptions, product images/URLs, encoded-value labels, entry numbering, and footer. Reuse the compact layout's aspect ratios, quiet margins, and adaptive widths. Skip product-image requests entirely; retain generation-error labels and use “Untitled product” for empty titles.
