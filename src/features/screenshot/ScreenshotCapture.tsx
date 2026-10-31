import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isIssueKey, jiraTypes, parseJira, suggestedBranch } from './parse-jira';
import type { JiraCandidate, JiraType } from './parse-jira';
import { validateImage } from './image-input';
import { recognizeScreenshot } from './recognize';

interface Draft { key: string; summary: string; jiraType: JiraType | null; branchType: string }
export function ScreenshotCapture({ onApply }: { onApply: (draft: Draft) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [candidates, setCandidates] = useState<JiraCandidate[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const controller = useRef<AbortController | null>(null);
  const image = useRef<File | null>(null);
  const url = useRef('');
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  const clearImage = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = '';
    image.current = null;
    setPreview('');
  };
  const close = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    clearImage();
    setDraft(null);
    setCandidates([]);
    setError('');
    setOpen(false);
  };
  const chooseCandidate = (candidate: JiraCandidate) => setDraft({ ...candidate, branchType: suggestedBranch(candidate.jiraType) });
  const start = async (file: File) => {
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setOpen(true);
    setBusy(true);
    setDraft(null);
    setCandidates([]);
    setError('');
    setProgress('Checking image…');
    try {
      await validateImage(file);
      job.signal.throwIfAborted();
      clearImage();
      image.current = file;
      url.current = URL.createObjectURL(file);
      setPreview(url.current);
      const lines = await recognizeScreenshot(file, job.signal, setProgress);
      if (!mounted.current || job.signal.aborted) return;
      const found = parseJira(lines);
      setCandidates(found);
      if (found.length === 1) chooseCandidate(found[0]);
      else if (found.length === 0) setError('No issue key found. Crop to the issue header and try again, or enter the task manually.');
    } catch {
      if (mounted.current && !job.signal.aborted) setError('Could not read this image. Use a clear PNG or JPEG, up to 10 MB and 16 megapixels. Crop to the issue header and retry.');
    } finally {
      if (mounted.current && controller.current === job) {
        controller.current = null;
        setBusy(false);
      }
    }
  };
  // Paste only image files: regular text paste continues through to the focused input.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    mounted.current = true;
    const paste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) { event.preventDefault(); void startRef.current(file); }
    };
    window.addEventListener('paste', paste);
    return () => {
      mounted.current = false;
      window.removeEventListener('paste', paste);
      controller.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  const select = () => input.current?.click();
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.files.length === 1) void start(event.dataTransfer.files[0]);
    else { setOpen(true); setError('Drop one PNG or JPEG at a time.'); }
  };
  return <>
    <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void start(file);
    }} />
    <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-dashed p-3" onDragOver={event => event.preventDefault()} onDrop={drop}>
      <Button variant="outline" onClick={select} disabled={busy}><ImagePlus aria-hidden="true" /> Import Jira screenshot</Button>
      <p className="text-sm text-muted-foreground">Paste a screenshot with Cmd+V / Ctrl+V, or drop a PNG or JPEG here.</p>
    </div>
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onDragOver={event => event.preventDefault()} onDrop={drop}>
        <DialogHeader>
          <DialogTitle>Review Jira screenshot</DialogTitle>
          <DialogDescription>Recognition runs on this device. Check the fields before applying them. Images and recognized text are not saved.</DialogDescription>
        </DialogHeader>
        {preview && <img src={preview} alt="Screenshot being reviewed" className="max-h-48 w-full rounded border object-contain" />}
        {busy && <p role="status" className="text-sm">{progress}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!busy && candidates.length > 1 && <div className="space-y-2">
          <p className="text-sm">Several issue keys were found. Choose the issue to use.</p>
          <Select value={draft?.key ?? ''} onValueChange={key => chooseCandidate(candidates.find(candidate => candidate.key === key)!)}>
            <SelectTrigger aria-label="Issue candidate"><SelectValue placeholder="Choose an issue" /></SelectTrigger>
            <SelectContent>{candidates.map(candidate => <SelectItem key={candidate.key} value={candidate.key}>{candidate.key} — {candidate.summary || 'Title not found'}</SelectItem>)}</SelectContent>
          </Select>
        </div>}
        {!busy && draft && <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{(candidates.find(candidate => candidate.key === draft.key)?.confidence ?? 0) < 80 ? 'Some text is uncertain. Please correct it below.' : 'OCR can make mistakes. Check the key and title.'} Icon-only issue types need manual selection.</p>
          <label className="block space-y-1 text-sm font-medium">Issue key<Input value={draft.key} onChange={event => setDraft({ ...draft, key: event.target.value })} /></label>
          <label className="block space-y-1 text-sm font-medium">Summary<Input value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><label className="text-sm font-medium" id="ocr-jira-type">Jira issue type</label>
              <Select value={draft.jiraType ?? 'unknown'} onValueChange={value => {
                const jiraType = value === 'unknown' ? null : value as JiraType;
                setDraft({ ...draft, jiraType, branchType: draft.branchType === 'hotfix' ? 'hotfix' : suggestedBranch(jiraType) });
              }}>
                <SelectTrigger aria-labelledby="ocr-jira-type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="unknown">Unknown</SelectItem>{jiraTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium" id="ocr-branch-type">Git branch type</label>
              <Select value={draft.branchType} onValueChange={branchType => setDraft({ ...draft, branchType })}>
                <SelectTrigger aria-labelledby="ocr-branch-type"><SelectValue /></SelectTrigger>
                <SelectContent>{['feature','bugfix','hotfix'].map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Applying replaces the current form fields. Save Task adds it to history.</p>
        </div>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={close}>Cancel</Button>
          {!busy && <Button variant="outline" onClick={select}>Choose image</Button>}
          {!busy && error && image.current && <Button variant="outline" onClick={() => { if (image.current) void start(image.current); }}>Retry</Button>}
          {!busy && draft && <Button disabled={!isIssueKey(draft.key) || !draft.summary.trim()} onClick={() => { onApply({ ...draft, summary: draft.summary.trim() }); close(); }}>Apply to task form</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
