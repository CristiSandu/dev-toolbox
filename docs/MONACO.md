# XML/XAML formatting and text comparison

Open **XAML Formatter** at `/xaml`.

## Format

Paste XML/XAML into Input, choose **Format XML**, or press **Cmd/Ctrl+Shift+F**. Output is read-only and has its own Copy button. Clear removes both fields. Each editor supports **Cmd/Ctrl+F** search; **Ctrl+M** (Windows) or **Ctrl+Shift+M** (macOS) toggles whether Tab inserts indentation or moves focus (Monaco's keyboard mode).

The browser's XML parser checks well-formedness before the existing `vkbeautify` formatter runs. Namespace/binding text is preserved by the existing formatter. This does not check XAML classes, bindings, resources, or runtime behavior. Errors appear outside the output, preserve input and the last successful output, and never become copied output. A label identifies output that predates the current input.

Blank documents, DOCTYPE declarations, and input larger than 2 MiB (UTF-8) cannot be formatted. Above 256 KiB, the UI warns that editing/formatting can take longer. XML parsing and formatting run on the UI thread; the unchanged formatter's microbenchmark is not an editor-latency measurement.

## Diff

Original and Modified accept arbitrary text; neither side is formatted. Both are editable side by side. Inline view edits Modified; choose Side by side to edit Original. Narrow windows initially choose inline view, and the layout selector can still choose side by side.

Use Copy original / Copy modified, Swap, or Clear both. **Ignore leading/trailing whitespace** defaults off. It corresponds to Monaco's `ignoreTrimWhitespace`: it does not ignore every whitespace change inside a line. Identical text reports no differences. Format and Diff keep separate text across tab switches; text is session-only and is reset when leaving the route.

Monaco limits diff computation to two seconds and a configured maximum file size of 2 MiB per side. The UI warns on UTF-8 byte size; Monaco's internal size accounting can differ for non-ASCII text. A large or complex comparison may be unavailable or incomplete. Reduce the text if needed.

## Implementation

- `@monaco-editor/react` 4.7 supports React 19 through its declared peer dependencies.
- Installed `monaco-editor` 0.57.0 is supplied to `loader.config({ monaco })`. The default CDN loader is bypassed.
- Only the editor API, XML language registration, and required editing contributions are imported. Vite bundles the editor worker and XML language chunk locally. The icon CSS/font is imported directly because this Monaco version's export map exposes JS paths only.
- The `/xaml` page is lazy-loaded; Task Generator and Code Generator do not initialize Monaco. Models/editors are disposed by the React wrapper on tab/route unmount; custom diff listeners are also disposed.
- A DOMPurify override to 3.4.17 replaces Monaco's pinned affected dependency. Review this override when upgrading Monaco. `npm audit` reports zero vulnerabilities after installation.
- App theme selects Monaco's `vs` or `vs-dark`; automatic layout follows split-panel resizing. Ace/react-ace have been removed. No Rust or database changes are needed.

Setup references: [Monaco React local-package configuration](https://github.com/suren-atoyan/monaco-react#use-monaco-editor-as-an-npm-package), [Monaco ESM integration](https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md). Installed package exports were used for the 0.57 import paths.

## Verification record

29 JS tests pass, including existing XML/XAML regression fixtures and new UTF-8/DTD/size checks. TypeScript and the production bundle build pass. The formatter benchmark on the same Apple M4 Pro/Node 24 environment reports 100,064 bytes: 1.89 ms first call / 0.87 ms warm median; 1,000,064 bytes: 10.41 ms first call / 8.07 ms warm median. The M0 medians were 0.86 / 8.79 ms; these are formatter-only observations with no rendering or XML-validation cost.

A separately identified packaged macOS debug app was built with external WebView HTTP connections disallowed by a temporary CSP, while local asset/IPC access stayed enabled. It loaded Monaco, formatted a namespaced XAML fixture using Cmd+Shift+F, opened editor search, rejected malformed XML with a line/column error while preserving the earlier output, and computed identical/changed text comparisons. Production CSP was not changed. This is an offline-asset dependency check, not a system-wide network disconnection test; Tauri's native updater networking is separate.

Before release, repeat packaged interaction checks on Windows and Intel macOS, including theme, shortcuts, resizing, copy, tab retention, inline/split editing, whitespace options, and representative 100 KB / 1 MB editor workloads. Automated formatter timings do not establish large-document UI latency or peak memory.

Final macOS confirmation: the bundled icon font and fixed editor hosts rendered correctly without the earlier layout growth. Whitespace-only changes showed a changed region with the option off and no differences with it on. Swap, inline view, and Format/Diff tab retention were exercised. Packaged formatting completed for both 100,064- and 1,000,064-character fixtures; the larger fixture showed the large-document warning and current formatted output. No precise UI latency or peak-memory measurement is claimed. The isolated final check app was closed afterward.

## Original-side cursor fix

The React wrapper 4.7.0 unconditionally calls `original.setValue` when its `original` prop changes. Echoing every original-side edit through that prop reset the cursor and undo history. The wrapper now receives a stable initial original value; a guarded synchronization updates the model only for differing external state, such as Swap or Clear. Modified-side behavior is unchanged. Two regression tests cover typing echoes and explicit replacements.

Packaged macOS cursor regression check: entered three lines sequentially in Original and observed their normal order; undo removed the latest edit while retaining earlier lines. Swap moved the content to Modified and Clear both returned to an empty comparison. The isolated verification app was then closed. All 31 JS tests and the production/native builds pass. Windows interaction verification remains pending.

## JSON formatting

The sidebar/header now say **Text Formatter**; the existing `/xaml` route is retained. In Format, select **JSON** from Format language. Format JSON and Cmd/Ctrl+Shift+F validate strict JSON and indent by two spaces. Input/output, Copy, Clear, search, app themes, and the independent Diff tab work as before. Switching XML/XAML ↔ JSON preserves the current text and previous output; a stale-output notice appears until the selected language is successfully formatted. The previous output retains its own language highlighting.

Validation uses `JSON.parse`; formatting rewrites whitespace around the original tokens instead of reserializing parsed values. Large numbers, exponent/decimal spelling, negative zero, duplicate object keys, original key order, and escaped string contents are preserved. Root arrays, objects, and scalar JSON values are supported. Comments and trailing commas are rejected. Errors leave input and previous output intact.

JSON shares the 2 MiB UTF-8 input limit and large-document warning. Nesting is capped at 200 and formatted output at 8 MiB to bound indentation expansion. JSON language support and its worker are bundled locally from the existing Monaco dependency. JSON schema network requests are disabled. No new dependency, database change, or JSON-to-XML conversion is introduced.

JSON verification: 36 JS tests pass, including nesting, scalar roots, invalid input, UTF-8 limits, precision/key/string preservation, and bounded output expansion. The production and isolated packaged macOS builds pass. In the packaged app with external WebView connections blocked, JSON highlighting and Cmd+Shift+F produced two-space output retaining `9007199254740993`; invalid JSON preserved the prior output. Switching to XML kept the current text, and formatting a new XML fixture still worked. The test app was closed afterward. Windows JSON interaction checks remain pending.

## Consistent Format and Diff layout

Both modes use the same toolbar positions, selector sizing, primary action, Clear button, and shortcut hint. Format keeps its language selector; Diff uses the matching layout selector (Side by side / Inline). The shared editor surface gives both modes matching title bars, borders, and Copy buttons. Diff copy actions sit beside Original and Modified, and its status is shown in the card footer. The Original header follows the actual pane width during split resizing. Text, formatting, diff options, and the original-side cursor fix are preserved.

Layout verification: production/native builds and all 36 existing JS tests pass. Inspected Format and Diff in an isolated packaged macOS app: matching toolbar/card header heights, titled Copy actions, and consistent frame styling. Original/Modified editing, switching to Inline, and Copy original (success notification) were exercised. The test app was closed afterward. Windows and narrow-window visual checks remain pending.
