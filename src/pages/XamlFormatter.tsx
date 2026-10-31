import { useEffect, useRef, useState } from 'react';
import { useDraftState } from '@/hooks/use-draft-state';
import { WorkspaceHeading } from '@/components/workspace';
import { WandSparkles, ArrowLeftRight, Eraser, Columns2, Braces } from 'lucide-react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EditorSurface, EditorPaneHeader } from '@/features/formatter/EditorSurface';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useIsMobile } from '@/hooks/use-mobile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatJson } from '@/features/formatter/json-formatting';
import { formatXml } from '@/lib/xml-formatting';
import { editorOptions, monaco } from '@/features/formatter/monaco';
import { TextDiff } from '@/features/formatter/TextDiff';
import { LARGE_TEXT_BYTES, MAX_TEXT_BYTES, textBytes, validateXml } from '@/features/formatter/xml-validation';

export default function XamlFormatter() {
  const [tab, setTab] = useDraftState('formatter.tab', 'format');
  const [language, setLanguage] = useDraftState<'xml' | 'json'>('formatter.language', 'xml');
  const [formattedLanguage, setFormattedLanguage] = useDraftState<'xml' | 'json'>('formatter.formattedLanguage', 'xml');
  const [input, setInput] = useDraftState('formatter.input', '');
  const [output, setOutput] = useDraftState('formatter.output', '');
  const [formattedInput, setFormattedInput] = useDraftState('formatter.formattedInput', '');
  const [original, setOriginal] = useDraftState('formatter.original', '');
  const [modified, setModified] = useDraftState('formatter.modified', '');
  const [inline, setInline] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [ignoreWhitespace, setIgnoreWhitespace] = useDraftState('formatter.ignoreWhitespace', false);
  const [error, setError] = useState('');
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'review-dark' : 'review-light';
  const mobile = useIsMobile();
  const format = () => {
    const issue = language === 'xml' ? validateXml(input) : null;
    if (issue) { setError(issue); return; }
    try {
      setOutput(language === 'json' ? formatJson(input) : formatXml(input));
      setFormattedLanguage(language);
      setFormattedInput(input);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not format this document. Input and the previous output have been preserved.');
    }
  };
  const formatRef = useRef(format);
  formatRef.current = format;
  const mount: OnMount = instance => {
    // Register on the editor so Monaco cannot swallow the app's shortcut.
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => formatRef.current());
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (tab === 'format' && (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault(); formatRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab]);
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error('Could not copy text. Select it in the editor and use Cmd/Ctrl+C.'); }
  };
  const inputSize = textBytes(input);
  const diffSize = Math.max(textBytes(original), textBytes(modified));
  const panel = (label: string, value: string, readOnly: boolean) => <EditorSurface header={
    <EditorPaneHeader title={label} canCopy={!!value} onCopy={() => void copy(value, label)} />
  }>
    <div className="absolute inset-0"><Editor language={readOnly ? formattedLanguage : language} value={value} onChange={readOnly ? undefined : value => { setInput(value ?? ''); setError(''); }} theme={theme}
      onMount={mount} loading={<p role="status">Loading editor…</p>}
      options={{ ...editorOptions, readOnly, ariaLabel: label }} /></div>
  </EditorSurface>;
  return <div className="tool-page"><WorkspaceHeading title="Text tools" description="Format a document or compare two versions, entirely on your device." /><Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col gap-4">
    <div className="tool-toolbar">
      <TabsList aria-label="Formatter mode"><TabsTrigger value="format"><Braces />Format</TabsTrigger><TabsTrigger value="diff"><Columns2 />Compare</TabsTrigger></TabsList>
      {tab === 'format' ? <>
        <Select value={language} onValueChange={value => { setLanguage(value as 'xml' | 'json'); setError(''); }}>
          <SelectTrigger aria-label="Format language" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="xml">XML / XAML</SelectItem><SelectItem value="json">JSON</SelectItem></SelectContent>
        </Select>
        <Button onClick={format} disabled={!input.trim() || inputSize > MAX_TEXT_BYTES}><WandSparkles />Format {language === 'json' ? 'JSON' : 'XML'}</Button>
        <Button variant="outline" disabled={!input && !output} onClick={() => { setInput(''); setOutput(''); setFormattedInput(''); setError(''); }}><Eraser />Clear</Button>
      </> : <>
        <Select value={inline ? 'inline' : 'split'} onValueChange={value => setInline(value === 'inline')}>
          <SelectTrigger aria-label="Comparison layout" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="split">Side by side</SelectItem><SelectItem value="inline">Inline</SelectItem></SelectContent>
        </Select>
        <Button disabled={!original && !modified} onClick={() => { setOriginal(modified); setModified(original); }}><ArrowLeftRight />Swap sides</Button>
        <Button variant="outline" disabled={!original && !modified} onClick={() => { setOriginal(''); setModified(''); }}><Eraser />Clear</Button>
      </>}
      <span className="toolbar-hint">{tab === 'format' ? 'Format: Cmd/Ctrl+Shift+F · ' : ''}Find: Cmd/Ctrl+F</span>
    </div>
    <TabsContent value="format" className="flex flex-col min-h-0 gap-3 data-[state=inactive]:hidden">
      <p className="field-hint shrink-0">{language === 'json' ? 'Formats strict JSON with two-space indentation, preserving number precision and key order. Comments and trailing commas are not supported.' : 'Formats XML and XAML after a syntax check. XAML runtime behavior is not validated.'}</p>
      {inputSize > MAX_TEXT_BYTES ? <p role="alert" className="text-sm text-destructive">Input exceeds 2 MiB. Reduce its size to format.</p> : inputSize > LARGE_TEXT_BYTES && <p className="text-sm text-muted-foreground">Large document: formatting and editing may take longer.</p>}
      {error && <p role="alert" className="inline-notice error-notice shrink-0 whitespace-pre-wrap">{error}</p>}
      {output && (formattedInput !== input || formattedLanguage !== language) && <p role="status" className="inline-notice">Input has changed. Format again to update the output.</p>}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup key={mobile ? "vertical" : "horizontal"} direction={mobile ? 'vertical' : 'horizontal'} className={mobile ? "min-h-[600px]" : "h-full min-h-[300px]"}>
          <ResizablePanel defaultSize={50} minSize={20}><div className={mobile ? 'h-full pb-2' : 'h-full pr-2'}>{panel(language === 'json' ? 'Input JSON' : 'Input XML / XAML', input, false)}</div></ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={20}><div className={mobile ? 'h-full pt-2' : 'h-full pl-2'}>{panel('Formatted output', output, true)}</div></ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TabsContent>
    <TabsContent value="diff" className="flex flex-col min-h-0 gap-3 data-[state=inactive]:hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <p>{inline ? 'Edit Modified in inline view. Switch to side by side to edit Original.' : 'Edit either side to compare text as entered.'}</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={ignoreWhitespace} onChange={event => setIgnoreWhitespace(event.target.checked)} />
          Ignore leading/trailing whitespace
        </label>
      </div>
      {diffSize > MAX_TEXT_BYTES ? <p role="alert" className="text-sm text-destructive">Comparison supports up to 2 MiB per side. Reduce the text to compare.</p> : diffSize > LARGE_TEXT_BYTES && <p className="text-sm text-muted-foreground">Large comparison: computation is limited to two seconds.</p>}
      <div className="flex-1 min-h-[260px] relative">
        <div className="absolute inset-0">
        <TextDiff original={original} modified={modified} setOriginal={setOriginal} setModified={setModified} inline={inline} ignoreWhitespace={ignoreWhitespace} theme={theme} onCopy={copy} /></div>
      </div>
    </TabsContent>
  </Tabs></div>;
}
