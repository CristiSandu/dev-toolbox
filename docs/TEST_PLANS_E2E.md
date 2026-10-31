# Test Plans native end-to-end check

Date: 2026-10-31. Platform: macOS Apple Silicon. Application: Dev Toolbox Review (`com.devtoolbox.redesign-review`), debug bundle version 0.3.0.

## Reported failure and repair

Reproduced `Command list_test_projects not found` in the running review application. The application was loading the current frontend from `127.0.0.1:1420`, but its native executable was built at 16:24, before the Test Plans commands were added. The command registration in the current Rust source was correct.

Rebuilt and replaced the review bundle, keeping its identifier and existing application data. The rebuilt bundle loads its own packaged frontend from `tauri://localhost`, keeping the frontend and backend together. The installed production application was not replaced.

The source now translates this specific missing-command failure into an instruction to open the updated application, and disables creation actions while the initial workspace load has failed. Other load errors retain their details.

Rebuild command:

```sh
npm run tauri build -- --debug --ci \
  --config '{"productName":"Dev Toolbox Review","identifier":"com.devtoolbox.redesign-review","bundle":{"createUpdaterArtifacts":false}}' \
  --bundles app -- --locked
```

Quit the old review application before copying the generated bundle to `/tmp/Dev Toolbox Review.app` and reopening it. Reloading a frontend tab alone cannot add commands to an older native executable.

## Native checks completed

These checks used the actual packaged application, real Tauri commands, and its SQLite database. Desktop commands and barcode generation were not mocked.

| Workflow | Observed result |
| --- | --- |
| Open Test Plans | Explorer and workspace load without the reported command error. |
| Create project and case | Created `E2E · Product scanning` and a case with a title and Markdown description. |
| Render Markdown | Headings, emphasis, task lists, a table, and a fenced JSON code block render correctly. |
| Switch case tabs | Description and Test List retain case content and the active product draft. |
| JSON product input | Added five mixed-format fixtures with product titles, descriptions, and image URLs. |
| Generate list | EAN-13, QR Code, Code128, and DataMatrix all generate through Rust. |
| Invalid barcode | A deliberately invalid EAN (`123`) shows an item error; the four valid products remain usable. Export actions are disabled for the failed code. |
| Product images | HTTP image URLs load thumbnails and the large product image. A missing image displays the fallback. |
| SVG clipboard | Copy SVG reports success through the native WebView clipboard. |
| SVG and PNG exports | Both files appear in Downloads. Exported SVG parses as XML; PNG has a valid signature and dimensions of 420 × 200. |
| Multiple lists | Added a second named list, `Returns`, without changing the first list. |
| Input validation | A JSON numeric `text` value is rejected without modifying the list. |
| Leading zeroes and duplicates | Line input preserves two distinct `0001` entries. Editing the second changes only that entry to `0002`. |
| Save and history | Case saves create revisions; history shows revision summaries, formatted descriptions, and the saved product tables. Revision 1 retains its original single-list snapshot. |
| Unsaved changes | Cancel preserves a draft; Discard returns to the project without changing the saved case. |
| Native window close | Cmd+W opens Save/Discard/Cancel. Cancel keeps the window open. Save commits the third revision and closes the window. |
| Complete restart | Reopening the application retains the case title, Markdown, two lists, eight products, and three history snapshots. The selected product code is regenerated on demand. |
| Existing data | Compared the migrated database with a pre-test SQLite backup: the existing task row and all three code-history rows are unchanged. |

The sample project remains in the review app for inspection. Test images use existing app assets served by the local development server; image fallback remains available when that server is stopped.

## Additional verification and limits

- `npm test`: 52 tests passed, including the missing-native-command recovery message and Markdown rendering/security checks.
- The debug macOS application build completed successfully with the lockfile enforced.
- The previous implementation check passed 18 Rust tests; one release-artifact test requires external signed artifacts and was skipped. No Rust logic changed during this repair.
- Earlier browser checks covered narrow layouts, dark mode, failed-save draft retention, and additional navigation flows using mocked desktop commands; those checks are distinct from the native checks above.
- Windows, Intel macOS, and destructive UI workflows were not exercised in this native pass. Database tests cover transactional deletion, stale writes, and rollback on revision failure.

## Preview and JSON sharing follow-up (2026-10-31)

Rebuilt and relaunched the packaged Review app after adding these changes, then exercised the real macOS UI and native save/open dialogs:

- Product image is an 80px thumbnail in the top-right header; the EAN-13 and DataMatrix codes fit the remaining preview canvas with their aspect ratio preserved.
- Hide/show Projects frees the explorer area and preserves the selected DataMatrix product. A first implementation remounted the workspace; the final implementation keeps the case pane mounted while adding/removing the explorer panel.
- Full screen fills the app's content area with the complete DataMatrix code, title, and encoded value. Escape returns to the same product. Corrected the inherited dialog translation that initially placed the full-screen canvas offscreen.
- Export case writes `/tmp/test-plans-case-sharing.json` through the native Save dialog. It contains the case's Markdown, both lists, all eight products, titles, values, formats, descriptions, and image URLs.
- Import JSON previews that file, offers existing/new destination projects, and creates a case in a new `Imported test cases` project. Its description renders correctly and it starts at revision 1.
- Project explorer menu → Export project JSON writes `/tmp/test-plans-project-sharing.json`. Its case content matches the single-case export exactly.
- Importing the project file previews its name/count and creates a separate project with the same name. Its case content matches the original, its history starts at revision 1, and opening Test List shows both lists/eight products and regenerates the selected code.
- SQL checks after these imports confirm the original case remains at revision 3 with all three snapshots. Both copied cases preserve the exact source content. Existing task and code-generation history rows still match the pre-feature backup.

The test copies remain in the Review app for inspection. The installed production app was not replaced.

Verification: 52 JavaScript tests pass; 20 Rust unit/integration tests pass, with the signed-release-artifact smoke test skipped because it needs external release artifacts. Portable JSON tests cover projects with multiple cases, single-case import into existing/new projects, field preservation, unsupported versions, malformed/oversized files, unsafe image URLs, and complete rollback on an injected write failure. The packaged macOS build succeeds. Windows and Intel macOS were not tested.

See [the sharing format](TEST_PLANS_JSON.md) for file limits and the portable schema. JSON shares current content and image URLs; local revision histories and rendered/downloaded images are excluded.

## Case PDF export follow-up (2026-10-31)

- Added Export PDF to the open-case toolbar and each test case's explorer menu. It exports current content, including draft edits, and includes every list/entry regardless of the active list or search filter.
- Native macOS check: opened the original eight-entry/two-list case, filtered the visible list to `Coffee` (two matching products), then exported with the native PDF Save dialog to `~/Downloads/test-case-pdf-e2e.pdf`.
- The resulting PDF is 182,212 bytes and five A4 pages. Text extraction confirms all eight entry values, both list names, the rendered Markdown description, all product titles, descriptions, image URLs, and the invalid EAN error are present. Raster inspection of every page confirms readable codes/images and no clipped or overlapping text; all extracted text bounds lie within the pages.
- Both valid product images embed through the native image loader. The missing image retains its URL and an unavailable label. EAN-13, QR, Code128, and DataMatrix codes are generated during export; the invalid EAN remains as an entry with its generation error.
- A separate five-page long-content fixture verifies a 10,000-character continuous value, long descriptions, Romanian/Cyrillic text, image placement, final-entry retention, and text bounds.
- Export uses bundled fonts and paginated text, with vector code assets where available. PDF code/image dependencies load only on demand. Large exports show progress and support cancellation before the final file write.
- Native image loading accepts credential-free HTTP(S) PNG/JPEG/WebP/GIF URLs, limits redirects, times out after six seconds, and caps input at 8 MB. Embedded thumbnails are resized to 320px. Images that fail loading/decoding retain their URLs. Output PDFs are limited to 64 MB. PDF export does not save a case revision or change its source data.

Verification: 56 JavaScript tests passed; 22 Rust unit/integration tests passed, with the external signed-release-artifact test skipped. The locked debug macOS bundle build passed and the Review app was replaced/reopened. Windows and Intel macOS were not exercised.

## Compact PDF layout follow-up (2026-10-31)

- Removed forced page breaks before code lists and reduced title/entry spacing. Product images are small header thumbnails. Standard matrix codes use up to four columns; linear codes use two, and dense codes or long metadata use wider/full-width layouts.
- Code dimensions follow the generated asset's aspect ratio. Sizing reserves clear quiet margins and a minimum module-size budget; code/value groups in compact rows stay on the same page. Exceptionally dense codes that exceed the page's available width are labeled for enlarged printing rather than claiming a scanning guarantee.
- Rebuilt/reopened the native macOS Review app and exported the original eight-entry case: five pages became two, with all entries, metadata, images, and the intentionally invalid EAN retained.
- Rendered the final native mixed-format PDF at both 150 and 300 DPI and decoded it with ZXing-C++: all seven valid values were recovered at each resolution across QR Code, EAN-13, Code128, and DataMatrix.
- Imported an additional `Compact PDF scan check` case with twelve distinct QR entries. The final native export fits all twelve on one A4 page; ZXing-C++ decoded every value at both 150 and 300 DPI. The fixture remains in the Review app for inspection.
- Visually inspected both pages of the mixed-format export and the complete twelve-code page. Page bounds checks found no clipped text. Long-value/description checks retain complete source text and final entries through pagination.
- Automated JavaScript checks: 58 pass, including adaptive column counts, preservation of long metadata, whole-entry rows, and real PDF generation. TypeScript and the packaged macOS build pass. Rust code did not change in this follow-up.

These are software decoding checks on rendered PDF pages, not physical printer/scanner certification. Print at actual size to preserve the intended code dimensions. Physical hardware and Windows were not tested.

## Codes-only PDF follow-up (2026-10-31)

- Added a small Codes-only PDF button directly beside Export PDF, plus an equivalent case-menu action. Default filenames end in `-codes-only.pdf`.
- Export includes every entry across every list in source order, using compact rows and the existing adaptive code sizing/quiet margins. Each title is centered beneath its code. Empty titles show `Untitled product`; failed code generation remains an explicit error entry.
- The lightweight variant omits visible case/list headings, descriptions, product images/URLs, entry numbers, separate values, generated SVG text labels, and the footer. It skips product-image requests entirely and shares the existing progress/cancellation/save path. Full PDF export retains its existing content.
- Rebuilt and reopened the native macOS Review app. Confirmed both adjacent PDF buttons, exported the original eight-entry case to `/tmp/dev-toolbox-pdf-check/codes-only-native.pdf`, and observed the Codes-only PDF exported notice with only the expected invalid-code warning.
- The result fits on one A4 page. Inspected its rendered page and extracted text: all six nonempty product titles and both Untitled product placeholders are present, with no case description, product images/URLs, encoded labels, or footer. Its only raster image is the generated Code128 code.
- ZXing-C++ recovered all seven valid values from the PDF at both 150 and 300 DPI, across QR, EAN-13, Code128, and DataMatrix. The intentionally invalid EAN remains labeled.
- 60 JavaScript tests pass, including the full-PDF regression checks, codes-only content/ordering checks, and hidden-metadata-independent column sizing. TypeScript and the packaged macOS build pass. Rust code did not change in this follow-up. Physical printer/scanner testing and Windows were not exercised.
