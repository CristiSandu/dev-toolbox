import { useEffect, useRef, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor, IDisposable } from 'monaco-editor';
import { editorOptions } from './monaco';
import { EditorSurface, EditorPaneHeader } from './EditorSurface';
import { syncDiffOriginal } from './sync-diff-original';

interface Props {
  original: string; modified: string; theme: string; inline: boolean; ignoreWhitespace: boolean;
  setOriginal: (text: string) => void; setModified: (text: string) => void;
  onCopy: (text: string, label: string) => Promise<void>;
}
export function TextDiff({ original, modified, theme, inline, ignoreWhitespace, setOriginal, setModified, onCopy }: Props) {
  const [originalWidth, setOriginalWidth] = useState<number | null>(null);
  const initialOriginal = useRef(original);
  const [instance, setInstance] = useState<editor.IStandaloneDiffEditor | null>(null);
  useEffect(() => {
    const model = instance?.getModel()?.original;
    if (model) syncDiffOriginal(model, original);
  }, [instance, original]);
  const subscriptions = useRef<IDisposable[]>([]);
  const [status, setStatus] = useState('Enter text to compare.');
  useEffect(() => () => subscriptions.current.forEach(subscription => subscription.dispose()), []);
  const mount = (instance: editor.IStandaloneDiffEditor) => {
    setInstance(instance);
    setOriginalWidth(instance.getOriginalEditor().getLayoutInfo().width);
    subscriptions.current = [
      instance.getOriginalEditor().onDidLayoutChange(layout => setOriginalWidth(layout.width)),
      instance.getOriginalEditor().onDidChangeModelContent(() => setOriginal(instance.getOriginalEditor().getValue())),
      instance.getModifiedEditor().onDidChangeModelContent(() => setModified(instance.getModifiedEditor().getValue())),
      instance.onDidUpdateDiff(() => {
        const changes = instance.getLineChanges();
        setStatus(changes === null ? 'Comparison is not available.' : changes.length ? `${changes.length} changed region${changes.length === 1 ? '' : 's'}.` : 'No differences under the selected whitespace setting.');
      }),
    ];
  };
  return <EditorSurface header={
    <div className="flex w-full min-w-0 flex-wrap divide-x divide-border">
      <div className="flex min-w-0 shrink-0" style={{ width: !inline && originalWidth ? originalWidth : '50%' }}>
        <EditorPaneHeader title="Original" canCopy={!!original} onCopy={() => void onCopy(original, 'Original')} />
      </div>
      <div className="flex min-w-0 flex-1">
        <EditorPaneHeader title="Modified" canCopy={!!modified} onCopy={() => void onCopy(modified, 'Modified')} />
      </div>
    </div>
  } footer={<p role="status">{status}</p>}>
    <div className="absolute inset-0">
      {/* The wrapper calls setValue unconditionally when `original` changes. Sync it ourselves. */}
      <DiffEditor original={initialOriginal.current} modified={modified} language="plaintext" theme={theme} onMount={mount}
        loading={<p role="status">Loading comparison…</p>}
        options={{ ...editorOptions, originalEditable: true, readOnly: false, renderSideBySide: !inline, useInlineViewWhenSpaceIsLimited: false,
          ignoreTrimWhitespace: ignoreWhitespace, maxComputationTime: 2000, maxFileSize: 2,
          originalAriaLabel: 'Original text', modifiedAriaLabel: 'Modified text' }} /></div>
  </EditorSurface>;
}
