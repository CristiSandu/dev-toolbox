import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ArrowRight, History, RefreshCw } from "lucide-react";
import { tools } from "@/components/app-sidebar";
import { EmptyState } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { historyDate, historyTime, type CodeHistoryRow } from "@/lib/history";
import type { Task } from "@/lib/types/task";
import { codeHistorySummary, parseCodeHistory } from "@/lib/code-input";

interface RecentItem { key: string; label: string; kind: string; date: string; to: string }
export default function Home() {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    if (!isTauri()) { setLoading(false); return; }
    const [tasks, codes] = await Promise.allSettled([invoke<Task[]>("get_tasks"), invoke<CodeHistoryRow[]>("get_codegen_history")]);
    const items: RecentItem[] = [];
    if (tasks.status === "fulfilled") items.push(...tasks.value.map(task => ({ key: `task-${task.id}`, label: `${task.number} ${task.name}`, kind: "Task", date: task.created_at, to: `/task?record=${task.id}` })));
    if (codes.status === "fulfilled") items.push(...codes.value.map(code => ({ key: `code-${code.id}`, label: codeHistorySummary(parseCodeHistory(code.payload), code.summary), kind: code.mode === "multi" ? "Batch" : "Code", date: code.created_at, to: `/codes?entry=${code.id}` })));
    setRecent(items.sort((a, b) => historyTime(b.date) - historyTime(a.date)).slice(0, 6));
    if (tasks.status === "rejected" || codes.status === "rejected") setError("Some recent activity could not be loaded. You can still use every tool.");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const modifier = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";
  return <div className="home-page">
    <div className="home-intro"><h1>Ready when you are.</h1><p>Choose a tool and pick up where you left off.</p></div>
    <div className="tool-launchers" aria-label="Choose a tool">
      {tools.map(tool => <Link to={tool.to} key={tool.to} className="tool-launcher">
        <span className="launcher-icon"><tool.icon size={27} strokeWidth={1.6} aria-hidden="true" /></span>
        <span className="launcher-copy"><h2>{tool.label}</h2><span>{tool.description}</span></span>
        <kbd>{modifier}{tool.shortcut}</kbd><ArrowRight className="launcher-arrow" size={25} strokeWidth={1.5} aria-hidden="true" />
      </Link>)}
    </div>
    <section className="home-recent" aria-labelledby="recent-heading">
      <div className="section-heading"><h2 id="recent-heading">Recent activity</h2><span className="text-sm text-muted-foreground">Saved on this device</span></div>
      {error && <div role="alert" className="inline-notice"><span>{error}</span><Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw />Retry</Button></div>}
      {loading ? <p className="history-message" role="status">Loading recent activity…</p> : recent.length ? <div className="recent-list">
        {recent.map(item => <Link key={item.key} to={item.to} className="recent-row"><span className="recent-label">{item.label}</span><span className="type-badge">{item.kind}</span><time dateTime={item.date}>{historyDate(item.date)}</time><ArrowRight size={15} aria-hidden="true" /></Link>)}
      </div> : !error && <EmptyState icon={History} title="Your recent work will appear here" description={isTauri() ? "Save a task or generate a code to find it here next time." : "Saved tasks and code history are available in the desktop app."} />}
    </section>
    <div className="home-shortcuts">{tools.map(tool => <Link key={tool.to} to={tool.to}><kbd>{modifier}{tool.shortcut}</kbd>{tool.label}</Link>)}</div>
  </div>;
}
