import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/languages/definitions/xml/register.js';
import 'monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution.js';
// Monaco 0.57's export map exposes JS only; load its local icon font directly.
import '../../../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import 'monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register.js';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// Supplying the installed instance bypasses the wrapper's default CDN loader.
self.MonacoEnvironment = { getWorker: (_moduleId, label) => label === 'json' ? new JsonWorker() : new EditorWorker() };
loader.config({ monaco });
jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: false, trailingCommas: 'error', enableSchemaRequest: false, schemas: [] });

export const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  scrollBeyondLastLine: false,
  tabSize: 2,
  wordWrap: 'off',
  formatOnPaste: false,
  formatOnType: false,
  accessibilitySupport: 'auto',
};
export { monaco };
