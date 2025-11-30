"use client";

import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Plus, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Task } from "@/lib/types/task";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import AnimatedCopyButton from "@/components/animated-copy-button";

export default function TaskGenerator() {
  // Form state
  const [taskNumber, setTaskNumber] = useState<string>("");
  const [taskName, setTaskName] = useState<string>("");
  const [branchType, setBranchType] = useState<string>("feature");

  // Generated previews
  const normalizedName = taskName.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-");
  const generatedBranch = `${branchType}/${taskNumber}-${normalizedName}`;
  const generatedPR = `${taskNumber}: ${taskName}`;

  // Task list
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Filters
  const [search, setSearch] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const loadTasks = async () => {
    const items = (await invoke("get_tasks")) as Task[];
    setTasks(items);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const resetForm = () => {
    setSelectedTask(null);
    setTaskNumber("");
    setTaskName("");
    setBranchType("feature");
  };

  const saveTask = async () => {
    await invoke("save_task", {
      name: taskName,
      number: taskNumber,
      featureType: branchType,
      branch: generatedBranch,
      prTitle: generatedPR,
    });

    resetForm();
    await loadTasks();
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  // Filtering
  const filteredTasks = tasks
    .filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.number.toLowerCase().includes(search.toLowerCase()) ||
        t.feature_type.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sortOrder === "desc"
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  // Selecting task → populate form in read-only mode
  const onSelectTask = (t: Task) => {
    setSelectedTask(t);
    setTaskNumber(t.number);
    setTaskName(t.name);
    setBranchType(t.feature_type);
  };

  const deleteTask = async (id: number) => {
    try {
      await invoke("delete_task", { id });

      // If we were viewing this task, reset the form
      if (selectedTask?.id === id) {
        resetForm();
      }

      // Reload tasks from DB
      await loadTasks();

      // or optimistic update instead of reload:
      // setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error("Failed to delete task", e);
    }
  };

  const isViewOnly = selectedTask !== null;

  // LEFT PANEL UI
  const LeftPanel = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{isViewOnly ? "View Task" : "Add New Task"}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Task Number */}
        <Input
          disabled={isViewOnly}
          placeholder="Task Number"
          value={taskNumber}
          onChange={(e) => setTaskNumber(e.target.value)}
        />

        {/* Task Name */}
        <Input
          disabled={isViewOnly}
          placeholder="Task Name"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
        />

        {/* Generated Branch */}
        <div>
          <label className="text-sm font-medium">Generated Branch</label>
          <div className="flex items-center gap-2 mt-1">
            <Select
              value={branchType}
              disabled={isViewOnly}
              onValueChange={setBranchType}
            >
              <SelectTrigger>
                <SelectValue className="w-[50px]" placeholder="Branch type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="bugfix">Bugfix</SelectItem>
                <SelectItem value="hotfix">Hotfix</SelectItem>
              </SelectContent>
            </Select>

            <Input value={generatedBranch} readOnly />

            <AnimatedCopyButton text={generatedBranch} />
          </div>
        </div>

        {/* Generated PR Title */}
        <div>
          <label className="text-sm font-medium">Generated PR Title</label>
          <div className="flex items-center gap-2 mt-1">
            <Input value={generatedPR} readOnly />

            <AnimatedCopyButton text={generatedPR} />
          </div>
        </div>

        {!isViewOnly && (
          <Button onClick={saveTask} className="w-full">
            Save Task
          </Button>
        )}

        {isViewOnly && (
          <Button onClick={resetForm} className="w-full" variant="secondary">
            + Add New Task
          </Button>
        )}
      </CardContent>
    </Card>
  );

  const RightPanel = (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>Saved Tasks</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 flex-1 min-h-0">
        {/* Search + Sort */}
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number or name..."
          />

          <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest</SelectItem>
              <SelectItem value="asc">Oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="secondary"
          onClick={resetForm}
          className="flex gap-2 items-center"
        >
          <Plus size={16} /> New Task
        </Button>

        {/* Task List */}
        <ScrollArea className="flex-1 min-h-0 border rounded p-2">
          <div className="space-y-2">
            {filteredTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTask(t)}
                className={`relative p-3 rounded border cursor-pointer hover:bg-muted transition 
                ${selectedTask?.id === t.id ? "bg-muted" : ""}`}
              >
                <div className="font-medium">{t.pr_title}</div>
                <div className="text-xs text-muted-foreground">{t.branch}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(t.created_at).toLocaleString()}
                </div>
                <button
                  className="absolute right-1 top-1 p-1 rounded hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTask(t.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 h-full w-full md:overflow-hidden overflow-y-auto">
      {/* DESKTOP MODE — resizable side-by-side */}
      <div className="hidden md:block h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* LEFT */}
          <ResizablePanel defaultSize={45} minSize={30}>
            <div className="h-full pr-3 overflow-y-auto">{LeftPanel}</div>
          </ResizablePanel>

          <ResizableHandle />

          {/* RIGHT */}
          <ResizablePanel defaultSize={55} minSize={30}>
            <div className="h-full pl-3 overflow-y-auto">{RightPanel}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* MOBILE MODE — stacked */}
      <div className="block md:hidden space-y-4">
        {LeftPanel}
        {RightPanel}
      </div>
    </div>
  );
}
