import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { GitBranch, GitPullRequest, History, Plus, Trash2, Download, Upload, Search, X, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { WorkspaceHeading, EmptyState } from "@/components/workspace";
import AnimatedCopyButton from "@/components/animated-copy-button";
import { ScreenshotCapture } from "@/features/screenshot/ScreenshotCapture";
import { jiraTypes, type JiraType } from "@/features/screenshot/parse-jira";
import { useDraftState } from "@/hooks/use-draft-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { generateTaskNames } from "@/lib/task-generation";
import { confirmAction } from "@/lib/confirm-action";
import { historyDate, historyTime } from "@/lib/history";
import type { Task } from "@/lib/types/task";

const blankDraft = { number: "", name: "", branchType: "feature", jiraType: null as JiraType | null };
export default function TaskGenerator() {
  const [draft, setDraft] = useDraftState("task.draft", blankDraft);
  const [selectedTask, setSelectedTask] = useDraftState<Task | null>("task.selected", null);
  const [showHistory, setShowHistory] = useDraftState("task.historyOpen", false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [params, setParams] = useSearchParams();
  const openedRecord = useRef("");
  const mobile = useIsMobile();
  const view = selectedTask ? { number: selectedTask.number, name: selectedTask.name, branchType: selectedTask.feature_type, jiraType: selectedTask.jira_issue_type ?? null } : draft;
  const names = selectedTask ? { branch: selectedTask.branch, prTitle: selectedTask.pr_title } : generateTaskNames(draft.number, draft.name, draft.branchType);
  const ready = !!view.number.trim() && !!view.name.trim();
  const readonly = !!selectedTask || saving;
  const loadTasks = useCallback(async () => {
    setLoading(true); setLoadError("");
    if (!isTauri()) { setLoading(false); return; }
    try { setTasks(await invoke<Task[]>("get_tasks")); }
    catch { setLoadError("Could not load saved tasks. Try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => {
    const id = params.get("record");
    if (!id || loading || loadError || openedRecord.current === id) return;
    openedRecord.current = id;
    const task = tasks.find(task => String(task.id) === id);
    if (task) { setSelectedTask(task); setShowHistory(true); }
    else if (isTauri()) toast.error("This saved task is no longer available.");
  }, [params, tasks, loading, loadError, setSelectedTask, setShowHistory]);
  const clearRecordLink = () => { if (params.has("record")) setParams({}, { replace: true }); };
  const newTask = async () => {
    if (selectedTask) { setSelectedTask(null); clearRecordLink(); return; }
    if ((draft.number || draft.name) && !await confirmAction("Clear this task draft? Saved tasks will remain in history.")) return;
    setDraft(blankDraft); clearRecordLink();
  };
  const saveTask = async () => {
    if (!ready || saving || selectedTask) return;
    setSaving(true);
    try {
      await invoke("save_task", { name: draft.name, number: draft.number, featureType: draft.branchType, branch: names.branch, prTitle: names.prTitle, jiraIssueType: draft.jiraType });
      setDraft(blankDraft); toast.success("Task saved to history"); await loadTasks();
    } catch (error) { toast.error("Could not save task. Your draft has been kept.", { description: String(error) }); }
    finally { setSaving(false); }
  };
  const duplicate = async () => {
    if ((draft.number || draft.name) && !await confirmAction("Replace your current task draft with this saved task?")) return;
    setDraft(view); setSelectedTask(null); clearRecordLink();
  };
  const deleteTask = async (task: Task) => {
    if (!await confirmAction(`Permanently delete ${task.number} from task history? This cannot be undone.`, "Delete saved task?")) return;
    try {
      await invoke("delete_task", { id: task.id });
      if (selectedTask?.id === task.id) { setSelectedTask(null); clearRecordLink(); }
      await loadTasks(); toast.success("Saved task deleted");
    } catch (error) { toast.error("Could not delete this task", { description: String(error) }); }
  };
  const backup = async (mode: "export" | "import") => {
    try {
      const filters = [{ name: "JSON", extensions: ["json"] }];
      const filePath = mode === "export" ? await save({ filters, defaultPath: `tasks-${new Date().toISOString().split("T")[0]}.json` }) : await open({ filters, multiple: false });
      if (!filePath) return;
      if (mode === "export") { await invoke("export_tasks", { filePath }); toast.success("Tasks exported"); }
      else { const count = await invoke<number>("import_tasks", { filePath }); toast.success(`Imported ${count} tasks`); await loadTasks(); }
    } catch (error) { toast.error(`Could not ${mode} tasks`, { description: String(error) }); }
  };
  const filtered = tasks.filter(task => `${task.name} ${task.number} ${task.feature_type}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (sortOrder === "desc" ? -1 : 1) * (historyTime(a.created_at) - historyTime(b.created_at)));
  const source = <section className="pane h-full">
    <div className="pane-heading"><h2>{selectedTask ? "Saved task" : "Task details"}</h2>{selectedTask && <span className="type-badge">Read only</span>}</div>
    <div className="pane-body space-y-5">
      <div className="field"><label htmlFor="task-number">Task number</label><Input id="task-number" placeholder="e.g. DEV-124" value={view.number} readOnly={readonly} onChange={event => setDraft({ ...draft, number: event.target.value })} /></div>
      <div className="field"><label htmlFor="task-name">Task name</label><Input id="task-name" placeholder="e.g. Fix keyboard focus" value={view.name} readOnly={readonly} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div>
      <div className="field-grid">
        <div className="field"><label id="branch-type-label">Branch type</label><Select value={view.branchType} disabled={readonly} onValueChange={branchType => setDraft({ ...draft, branchType })}><SelectTrigger aria-labelledby="branch-type-label"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="feature">Feature</SelectItem><SelectItem value="bugfix">Bugfix</SelectItem><SelectItem value="hotfix">Hotfix</SelectItem></SelectContent></Select></div>
        <div className="field"><label id="jira-type-label">Jira issue type</label><Select value={view.jiraType ?? "unknown"} disabled={readonly} onValueChange={value => setDraft({ ...draft, jiraType: value === "unknown" ? null : value as JiraType })}><SelectTrigger aria-labelledby="jira-type-label"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Not specified</SelectItem>{jiraTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {selectedTask ? <Button onClick={() => void duplicate()} variant="secondary"><Plus />Use as draft</Button> : <Button onClick={() => void saveTask()} disabled={!ready || saving || !isTauri()}><Save />{saving ? "Saving…" : "Save task"}</Button>}
      <p className="field-hint">{selectedTask ? `Saved ${historyDate(selectedTask.created_at)}. Your unsaved draft is kept separately.` : !isTauri() ? "Copy your output here. Saving history is available in the desktop app." : "Fill in both fields to preview your branch and PR title. Save to keep them in history."}</p>
    </div>
    {!selectedTask && <div className="mt-auto border-t px-5 py-2"><ScreenshotCapture onApply={async captured => {
      if ((draft.number || draft.name) && !await confirmAction("Replace your task draft with the reviewed screenshot fields?")) return false;
      setDraft({ number: captured.key, name: captured.summary, jiraType: captured.jiraType, branchType: captured.branchType }); return true;
    }} /></div>}
  </section>;
  const result = <section className="pane h-full">
    <div className="pane-heading"><h2>Ready to use</h2><span className="text-xs text-muted-foreground">{selectedTask ? "Saved output" : ready ? "Updates as you type" : "Waiting for task details"}</span></div>
    <div className="result-block"><div className="result-block-header"><h3 className="flex items-center gap-2"><GitBranch size={15} />Branch name</h3><AnimatedCopyButton text={ready ? names.branch : ""} label="Copy branch name" /></div>{ready ? <p className="result-value">{names.branch}</p> : <p className="result-placeholder">Your branch name will appear here.</p>}</div>
    <div className="result-block"><div className="result-block-header"><h3 className="flex items-center gap-2"><GitPullRequest size={15} />Pull request title</h3><AnimatedCopyButton text={ready ? names.prTitle : ""} label="Copy pull request title" /></div>{ready ? <p className="result-value">{names.prTitle}</p> : <p className="result-placeholder">Your PR title will appear here.</p>}</div>
    <div className="pane-footer">Copy an output to use it in your editor or Git client.</div>
  </section>;
  return <div className="tool-page">
    <WorkspaceHeading title="Tasks" description="Turn task details into a branch name and a pull request title.">
      <Button variant="ghost" onClick={() => void newTask()}><Plus />{selectedTask ? "Back to draft" : "New task"}</Button>
      <Button variant={showHistory ? "secondary" : "outline"} aria-expanded={showHistory} aria-controls="task-history" onClick={() => setShowHistory(!showHistory)}><History />History{tasks.length > 0 && <span className="text-xs opacity-70">{tasks.length}</span>}</Button>
    </WorkspaceHeading>
    <div className="workbench">
      <div className="workbench-main">
        <ResizablePanelGroup key={mobile ? "vertical" : "horizontal"} direction={mobile ? "vertical" : "horizontal"} className={mobile ? "min-h-[920px]" : "h-full"}>
          <ResizablePanel defaultSize={mobile ? 60 : 43} minSize={30}><div className={mobile ? "h-full pb-2" : "h-full pr-2"}>{source}</div></ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={mobile ? 40 : 57} minSize={30}><div className={mobile ? "h-full pt-2" : "h-full pl-2"}>{result}</div></ResizablePanel>
        </ResizablePanelGroup>
      </div>
      {showHistory && <section id="task-history" className="pane history-pane" aria-label="Saved tasks">
        <div className="pane-heading"><h2>Saved tasks</h2><Button size="icon-sm" variant="ghost" aria-label="Close task history" onClick={() => setShowHistory(false)}><X /></Button></div>
        <div className="history-tools"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search saved tasks" placeholder="Search tasks…" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="flex gap-2"><Select value={sortOrder} onValueChange={setSortOrder}><SelectTrigger aria-label="Sort saved tasks" className="min-w-0 flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="desc">Newest first</SelectItem><SelectItem value="asc">Oldest first</SelectItem></SelectContent></Select><Button variant="ghost" size="icon" aria-label="Refresh task history" disabled={loading} onClick={() => void loadTasks()}><RefreshCw /></Button></div></div>
        <div className="history-items">{loading ? <p className="history-message" role="status">Loading saved tasks…</p> : loadError ? <div className="history-message" role="alert">{loadError}<Button variant="link" onClick={() => void loadTasks()}>Retry</Button></div> : filtered.length ? filtered.map(task => <div key={task.id} className={`history-item${selectedTask?.id === task.id ? " is-selected" : ""}`}><button type="button" className="history-select" aria-pressed={selectedTask?.id === task.id} onClick={() => { setSelectedTask(task); clearRecordLink(); }}><small>{task.number} · {task.feature_type}</small><strong>{task.name}</strong><small>{historyDate(task.created_at)}</small></button><Button size="icon-sm" variant="ghost" aria-label={`Delete ${task.number}`} onClick={() => void deleteTask(task)}><Trash2 className="size-3.5" /></Button></div>) : <EmptyState icon={History} title={search ? "No matching tasks" : "No saved tasks yet"} description={search ? "Try another task number or name." : "Save a task to reuse its branch and PR title."} />}</div>
        <div className="pane-footer flex gap-2"><Button size="sm" variant="ghost" disabled={!isTauri() || !tasks.length} onClick={() => void backup("export")}><Download />Export</Button><Button size="sm" variant="ghost" disabled={!isTauri()} onClick={() => void backup("import")}><Upload />Import</Button></div>
      </section>}
    </div>
  </div>;
}
