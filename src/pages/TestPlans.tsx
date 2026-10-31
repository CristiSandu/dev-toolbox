import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  BookOpen,
  FileText,
  FolderOpen,
  History,
  PanelRight,
  Pencil,
  Plus,
  Save,
  Upload,
  Download,
  FileDown,
} from "lucide-react";
import { open, save as saveFile } from "@tauri-apps/plugin-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { WorkspaceHeading, EmptyState } from "@/components/workspace";
import { confirmAction } from "@/lib/confirm-action";
import { useDraftState } from "@/hooks/use-draft-state";
import { MarkdownDescription } from "@/features/test-plans/MarkdownDescription";
import { ProjectExplorer } from "@/features/test-plans/ProjectExplorer";
import { ProductWorkspace } from "@/features/test-plans/ProductWorkspace";
import { RevisionHistory } from "@/features/test-plans/RevisionHistory";
import { useUnsavedChanges } from "@/features/test-plans/useUnsavedChanges";
import {
  newCase,
  validateCase,
  testPlanLoadError,
  type CaseContent,
  type TestCase,
  type TestProject,
  type TransferDocument,
} from "@/features/test-plans/model";
import "@/features/test-plans/test-plans.css";

export default function TestPlans() {
  const [projects, setProjects] = useState<TestProject[]>([]),
    [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [saveError, setSaveError] = useState("");
  const [projectId, setProjectId] = useDraftState<number | null>(
    "testPlans.project",
    null,
  );
  const [caseId, setCaseId] = useDraftState<number | null>(
    "testPlans.case",
    null,
  );
  const [expanded, setExpanded] = useDraftState<number[]>(
    "testPlans.expanded",
    [],
  );
  const [saved, setSaved] = useState<TestCase | null>(null),
    [draft, setDraft] = useState<CaseContent | null>(null);
  const [saving, setSaving] = useState(false),
    [acting, setActing] = useState(false),
    [workspaceKey, setWorkspaceKey] = useState(0);
  const [tab, setTab] = useState("description"),
    [editingDescription, setEditingDescription] = useState(false),
    [descriptionMode, setDescriptionMode] = useState<"write" | "preview">(
      "write",
    );
  const [history, setHistory] = useState(false),
    [explorerOpen, setExplorerOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useDraftState(
    "testPlans.sidebarVisible",
    true,
  );
  const [importDocument, setImportDocument] = useState<TransferDocument | null>(
    null,
  );
  const [importTarget, setImportTarget] = useState("new");
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState("");
  const [pdfProgress, setPdfProgress] = useState("");
  const pdfAbort = useRef<AbortController | null>(null);
  useEffect(() => () => pdfAbort.current?.abort(), []);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 1100px)").matches,
  );
  const [projectDialog, setProjectDialog] = useState<{
    id: number | null;
    name: string;
  } | null>(null);
  const mounted = useRef(true),
    savingRef = useRef(false);
  const dirty =
    !!draft &&
    (!saved || JSON.stringify(draft) !== JSON.stringify(saved.content));
  const disabled = saving || acting || loading || !!loadError;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const [nextProjects, nextCases] = await Promise.all([
        invoke<TestProject[]>("list_test_projects"),
        invoke<TestCase[]>("list_test_cases"),
      ]);
      if (!mounted.current) return;
      setProjects(nextProjects);
      setCases(nextCases);
      const selected = nextCases.find((entry) => entry.id === caseId);
      if (selected) {
        setSaved(selected);
        setDraft(selected.content);
        setProjectId(selected.projectId);
        setEditingDescription(false);
      } else if (
        projectId &&
        !nextProjects.some((project) => project.id === projectId)
      ) {
        setProjectId(null);
        setCaseId(null);
      }
    } catch (error) {
      if (mounted.current) setLoadError(testPlanLoadError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
    // Initial selection is restored once from UI state, not from a durable draft.
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)"),
      update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const save = async (): Promise<boolean> => {
    if (!draft || !projectId || savingRef.current) return false;
    const problem = validateCase(draft);
    if (problem) {
      setSaveError(problem);
      toast.error("Case could not be saved", { description: problem });
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const next = await invoke<TestCase>("save_test_case", {
        id: saved?.id ?? null,
        projectId,
        expectedRevision: saved?.revision ?? 0,
        content: draft,
      });
      if (!mounted.current) return false;
      setSaved(next);
      setDraft(next.content);
      setCaseId(next.id);
      setCases((current) =>
        [...current.filter((entry) => entry.id !== next.id), next].sort(
          (a, b) => a.id - b.id,
        ),
      );
      toast.success(`Case saved · revision ${next.revision}`);
      return true;
    } catch (error) {
      setSaveError(String(error));
      toast.error("Case could not be saved", { description: String(error) });
      return false;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const discard = () => {
    setDraft(saved?.content ?? null);
    setSaveError("");
  };
  const { guard, dialog } = useUnsavedChanges(
    dirty,
    saving || acting,
    save,
    discard,
  );
  const resetView = () => {
    setTab("description");
    setEditingDescription(false);
    setDescriptionMode("write");
    setSaveError("");
    setHistory(false);
    setWorkspaceKey((value) => value + 1);
  };
  const openCase = async (entry: TestCase) => {
    if (entry.id === saved?.id) {
      setExplorerOpen(false);
      return;
    }
    if (!(await guard())) return;
    setSaved(entry);
    setDraft(entry.content);
    setCaseId(entry.id);
    setProjectId(entry.projectId);
    resetView();
    setExplorerOpen(false);
  };
  const openProject = async (id: number) => {
    if (!(await guard())) return;
    setProjectId(id);
    setCaseId(null);
    setSaved(null);
    setDraft(null);
    resetView();
  };
  const createCase = async (id: number) => {
    if (!(await guard())) return;
    setProjectId(id);
    setCaseId(null);
    setSaved(null);
    setDraft(newCase());
    resetView();
    setEditingDescription(true);
    setExplorerOpen(false);
    setExpanded((current) =>
      current.includes(id) ? current : [...current, id],
    );
  };
  const createProject = async () => {
    if (await guard()) setProjectDialog({ id: null, name: "" });
  };
  const saveProject = async () => {
    if (!projectDialog?.name.trim() || acting) return;
    setActing(true);
    try {
      const id = await invoke<number>("save_test_project", projectDialog);
      const nextProjects = await invoke<TestProject[]>("list_test_projects");
      setProjects(nextProjects);
      setProjectDialog(null);
      setExpanded((current) =>
        current.includes(id) ? current : [...current, id],
      );
      if (projectDialog.id === null) {
        setProjectId(id);
        setCaseId(null);
        setSaved(null);
        setDraft(null);
        resetView();
      }
    } catch (error) {
      toast.error("Project could not be saved", { description: String(error) });
    } finally {
      setActing(false);
    }
  };
  const deleteProject = async (entry: TestProject) => {
    if (!(await guard())) return;
    const count = cases.filter((item) => item.projectId === entry.id).length;
    if (
      !(await confirmAction(
        `Delete “${entry.name}”, its ${count} test cases, and all their revision history?`,
        "Delete project?",
      ))
    )
      return;
    setActing(true);
    try {
      await invoke("delete_test_project", { id: entry.id });
      setProjects((current) =>
        current.filter((project) => project.id !== entry.id),
      );
      setCases((current) =>
        current.filter((item) => item.projectId !== entry.id),
      );
      setExpanded((current) => current.filter((id) => id !== entry.id));
      if (projectId === entry.id) {
        setProjectId(null);
        setCaseId(null);
        setSaved(null);
        setDraft(null);
        resetView();
      }
    } catch (error) {
      toast.error("Project could not be deleted", {
        description: String(error),
      });
    } finally {
      setActing(false);
    }
  };
  const deleteCase = async (entry: TestCase) => {
    if (!(await guard())) return;
    const count = entry.content.lists.reduce(
      (total, list) => total + list.products.length,
      0,
    );
    if (
      !(await confirmAction(
        `Delete “${entry.content.title}”, its ${count} products, and all revision history?`,
        "Delete test case?",
      ))
    )
      return;
    setActing(true);
    try {
      await invoke("delete_test_case", { id: entry.id });
      setCases((current) => current.filter((item) => item.id !== entry.id));
      if (saved?.id === entry.id) {
        setCaseId(null);
        setSaved(null);
        setDraft(null);
        resetView();
      }
    } catch (error) {
      toast.error("Case could not be deleted", { description: String(error) });
    } finally {
      setActing(false);
    }
  };
  const reloadSaved = async () => {
    if (!saved || !(await guard())) return;
    setActing(true);
    try {
      const rows = await invoke<TestCase[]>("list_test_cases");
      setCases(rows);
      const entry = rows.find((item) => item.id === saved.id);
      setSaved(entry ?? null);
      setDraft(entry?.content ?? null);
      setCaseId(entry?.id ?? null);
      resetView();
    } catch (error) {
      toast.error("Could not reload saved case", {
        description: String(error),
      });
    } finally {
      setActing(false);
    }
  };
  const exportJson = async (
    source: { project: TestProject } | { content: CaseContent },
  ) => {
    const isCase = "content" in source;
    if (!isCase && !(await guard())) return;
    const content = isCase ? source.content : null;
    if (content) {
      const problem = validateCase(content);
      if (problem) {
        toast.error("Case could not be exported", { description: problem });
        return;
      }
    }
    setActing(true);
    try {
      const name = isCase ? source.content.title : source.project.name;
      const filePath = await saveFile({
        filters: [{ name: "Test Plans JSON", extensions: ["json"] }],
        defaultPath: `${name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100) || "test-plan"}.json`,
      });
      if (!filePath) return;
      await invoke(
        isCase ? "export_test_case" : "export_test_project",
        isCase
          ? { content, filePath }
          : { projectId: source.project.id, filePath },
      );
      toast.success(isCase ? "Test case exported" : "Project exported");
    } catch (error) {
      toast.error("Export failed", { description: String(error) });
    } finally {
      setActing(false);
    }
  };
  const exportPdf = async (
    content: CaseContent,
    projectName: string,
    codesOnly = false,
  ) => {
    if (disabled) return;
    const problem = validateCase(content);
    if (problem) {
      toast.error("Case could not be exported", { description: problem });
      return;
    }
    if (codesOnly && !content.lists.some((list) => list.products.length)) {
      toast.error("Add at least one product before exporting codes.");
      return;
    }
    const controller = new AbortController();
    pdfAbort.current = controller;
    setActing(true);
    try {
      const filePath = await saveFile({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        defaultPath: `${content.title.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100) || "test-case"}${codesOnly ? "-codes-only" : ""}.pdf`,
      });
      if (!filePath) return;
      setPdfProgress("Preparing PDF…");
      const { createCasePdf } =
        await import("@/features/test-plans/export-pdf");
      const result = await createCasePdf(
        content,
        projectName,
        controller.signal,
        setPdfProgress,
        codesOnly,
      );
      if (result.buffer.length > 64_000_000)
        throw new Error(
          "PDF exceeds 64 MB. Reduce product-image sizes and try again.",
        );
      setPdfProgress("Saving PDF…");
      await invoke("save_test_case_pdf", {
        filePath,
        bytes: Array.from(result.buffer),
      });
      const notes = [
        result.failedCodes
          ? `${result.failedCodes} codes could not be generated and are labeled in the PDF.`
          : "",
        result.unavailableImages
          ? `${result.unavailableImages} images were unavailable; their URLs are included.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      toast.success(
        codesOnly ? "Codes-only PDF exported" : "Test case PDF exported",
        notes ? { description: notes, duration: 8000 } : undefined,
      );
    } catch (error) {
      if (controller.signal.aborted) toast("PDF export cancelled");
      else toast.error("PDF export failed", { description: String(error) });
    } finally {
      pdfAbort.current = null;
      setPdfProgress("");
      setActing(false);
    }
  };
  const chooseImport = async () => {
    setActing(true);
    try {
      const filePath = await open({
        filters: [{ name: "Test Plans JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return;
      const document = await invoke<TransferDocument>("read_test_plan_import", {
        filePath,
      });
      setImportTarget(projectId ? String(projectId) : "new");
      setImportName(document.project?.name ?? "Imported test cases");
      setImportError("");
      setImportDocument(document);
    } catch (error) {
      toast.error("Import failed", { description: String(error) });
    } finally {
      setActing(false);
    }
  };
  const confirmImport = async () => {
    if (!importDocument || !(await guard())) return;
    setActing(true);
    setImportError("");
    try {
      const id = await invoke<number>("import_test_plan", {
        document: importDocument,
        projectId: importTarget === "new" ? null : Number(importTarget),
        newProjectName:
          importDocument.project || importTarget !== "new" ? null : importName,
      });
      setImportDocument(null);
      toast.success("Import complete · new copies created");
      const [nextProjects, nextCases] = await Promise.all([
        invoke<TestProject[]>("list_test_projects"),
        invoke<TestCase[]>("list_test_cases"),
      ]);
      setProjects(nextProjects);
      setCases(nextCases);
      setProjectId(id);
      const importedCases = nextCases.filter((item) => item.projectId === id);
      const entry = importedCases[importedCases.length - 1];
      setSaved(entry ?? null);
      setDraft(entry?.content ?? null);
      setCaseId(entry?.id ?? null);
      setExpanded((current) =>
        current.includes(id) ? current : [...current, id],
      );
      resetView();
    } catch (error) {
      setImportError(String(error));
      toast.error("Could not finish importing", { description: String(error) });
    } finally {
      setActing(false);
    }
  };
  const project = projects.find((entry) => entry.id === projectId);
  const explorer = (
    <ProjectExplorer
      projects={projects}
      cases={cases}
      selectedProject={projectId}
      selectedCase={saved?.id ?? null}
      expanded={expanded}
      onExpanded={setExpanded}
      disabled={disabled}
      onProject={(id) => void openProject(id)}
      onCase={(entry) => void openCase(entry)}
      onNewProject={() => void createProject()}
      onRenameProject={(entry) =>
        setProjectDialog({ id: entry.id, name: entry.name })
      }
      onDeleteProject={(entry) => void deleteProject(entry)}
      onNewCase={(id) => void createCase(id)}
      onDeleteCase={(entry) => void deleteCase(entry)}
      onExportPdf={(entry, codesOnly) =>
        void exportPdf(
          entry.id === saved?.id && draft ? draft : entry.content,
          projects.find((item) => item.id === entry.projectId)?.name ?? "",
          codesOnly,
        )
      }
      onExportProject={(entry) => void exportJson({ project: entry })}
      onExportCase={(entry) =>
        void exportJson({
          content: entry.id === saved?.id && draft ? draft : entry.content,
        })
      }
      onHide={() => {
        setSidebarVisible(false);
        setExplorerOpen(false);
      }}
    />
  );
  const workspace = (
    <section className="pane tp-case-pane">
      {draft ? (
        <>
          <div className="tp-case-heading">
            <div className="field flex-1">
              <label htmlFor="tp-case-title" className="sr-only">
                Test case title
              </label>
              <Input
                id="tp-case-title"
                className="tp-case-title"
                maxLength={200}
                value={draft.title}
                disabled={disabled}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
              <p className="tp-case-context">
                {project?.name} <span aria-hidden="true">/</span> Test case
              </p>
            </div>
            <span className="tp-save-status" role="status">
              {saving
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : `Saved · revision ${saved?.revision ?? 0}`}
            </span>
          </div>
          {saveError && (
            <div role="alert" className="inline-notice error-notice m-3">
              <span>{saveError}</span>
              {saved && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void reloadSaved()}
                >
                  Reload saved case
                </Button>
              )}
            </div>
          )}
          <Tabs className="tp-case-tabs" value={tab} onValueChange={setTab}>
            <div className="tp-case-tabbar">
              <TabsList aria-label="Test case">
                <TabsTrigger value="description">
                  <BookOpen />
                  Description
                </TabsTrigger>
                <TabsTrigger value="tests">
                  <FileText />
                  Test List
                </TabsTrigger>
              </TabsList>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void exportJson({ content: draft })}
                >
                  <Download /> Export case
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void exportPdf(draft, project?.name ?? "")}
                >
                  <FileDown /> Export PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    void exportPdf(draft, project?.name ?? "", true)
                  }
                >
                  <FileDown /> Codes-only PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!saved || disabled}
                  onClick={() => setHistory(true)}
                >
                  <History />
                  History
                </Button>
              </div>
            </div>
            <TabsContent
              forceMount
              value="description"
              className="tp-description data-[state=inactive]:hidden"
            >
              <div className="tp-description-toolbar">
                <h2>Case description</h2>
                {editingDescription ? (
                  <>
                    <div
                      className="tp-mode-buttons"
                      aria-label="Description editing mode"
                    >
                      <Button
                        variant={
                          descriptionMode === "write" ? "secondary" : "ghost"
                        }
                        size="sm"
                        aria-pressed={descriptionMode === "write"}
                        onClick={() => setDescriptionMode("write")}
                      >
                        Write
                      </Button>
                      <Button
                        variant={
                          descriptionMode === "preview" ? "secondary" : "ghost"
                        }
                        size="sm"
                        aria-pressed={descriptionMode === "preview"}
                        onClick={() => setDescriptionMode("preview")}
                      >
                        Preview
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingDescription(false)}
                    >
                      Done editing
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingDescription(true);
                      setDescriptionMode("write");
                    }}
                  >
                    <Pencil />
                    Edit Markdown
                  </Button>
                )}
              </div>
              {editingDescription && descriptionMode === "write" ? (
                <div className="tp-markdown-editor">
                  <label htmlFor="tp-description-source">Markdown source</label>
                  <Textarea
                    id="tp-description-source"
                    disabled={disabled}
                    value={draft.descriptionMarkdown}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        descriptionMarkdown: event.target.value,
                      })
                    }
                    placeholder={
                      "# Test overview\n\nDescribe the scenario, setup, and expected behavior.\n\n- [ ] Scan each product code\n- [ ] Verify the product image"
                    }
                  />
                  <p className="field-hint">
                    Markdown supports headings, lists, tables, task lists, and
                    code blocks. Changes are saved with the case.
                  </p>
                </div>
              ) : (
                <div className="tp-description-rendered">
                  {draft.descriptionMarkdown ? (
                    <MarkdownDescription source={draft.descriptionMarkdown} />
                  ) : (
                    <EmptyState
                      icon={BookOpen}
                      title="Describe this test case"
                      description="Write the scenario and instructions in Markdown, then switch to Test List to prepare the product codes."
                    >
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingDescription(true);
                          setDescriptionMode("write");
                        }}
                      >
                        Add description
                      </Button>
                    </EmptyState>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent
              forceMount
              value="tests"
              className="tp-tests-content data-[state=inactive]:hidden"
            >
              <ProductWorkspace
                key={workspaceKey}
                content={draft}
                onChange={setDraft}
                disabled={disabled}
                active={tab === "tests"}
              />
            </TabsContent>
          </Tabs>
        </>
      ) : project ? (
        <EmptyState
          icon={FolderOpen}
          title={project.name}
          description={`${cases.filter((entry) => entry.projectId === project.id).length} test cases in this project. Open a case in the explorer or create one below.`}
        >
          <Button
            onClick={() => void createCase(project.id)}
            disabled={disabled}
          >
            <Plus />
            New test case
          </Button>
        </EmptyState>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Your product test workspace"
          description="Create a project, describe your test cases, and keep product code lists ready to scan."
        >
          <Button disabled={disabled} onClick={() => void createProject()}>
            <Plus />
            New project
          </Button>
        </EmptyState>
      )}
    </section>
  );
  return (
    <div className="tool-page tp-page">
      <WorkspaceHeading
        title="Test Plans"
        description="Describe your cases. Prepare products. Keep every change."
      >
        <Button
          variant="outline"
          disabled={disabled || !isTauri()}
          onClick={() => void chooseImport()}
        >
          <Upload /> Import JSON
        </Button>
        <Button
          variant="outline"
          disabled={disabled || !isTauri()}
          onClick={() => void createProject()}
        >
          <Plus />
          New project
        </Button>
        {projectId && (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => void createCase(projectId)}
          >
            <Plus />
            New test case
          </Button>
        )}
        {draft && (
          <Button disabled={disabled || !dirty} onClick={() => void save()}>
            <Save />
            Save case
          </Button>
        )}
        <Button
          variant="outline"
          aria-label={
            narrow || !sidebarVisible
              ? "Show project sidebar"
              : "Hide project sidebar"
          }
          aria-pressed={narrow ? explorerOpen : sidebarVisible}
          onClick={() =>
            narrow ? setExplorerOpen(true) : setSidebarVisible(!sidebarVisible)
          }
        >
          <PanelRight /> Projects
        </Button>
      </WorkspaceHeading>
      {pdfProgress && (
        <div className="inline-notice">
          <span role="status" aria-live="polite">
            {pdfProgress}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pdfProgress === "Saving PDF…"}
            onClick={() => pdfAbort.current?.abort()}
          >
            Cancel export
          </Button>
        </div>
      )}
      {!isTauri() ? (
        <section className="pane flex-1">
          <EmptyState
            icon={BookOpen}
            title="Open Test Plans in the desktop app"
            description="Projects, test cases, and code generation are stored locally on your device."
          />
        </section>
      ) : loadError ? (
        <div className="inline-notice error-notice" role="alert">
          {loadError}
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      ) : loading ? (
        <p role="status">Loading test plans…</p>
      ) : (
        <div className="tp-workbench">
          {narrow ? (
            workspace
          ) : (
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="test-plan-workspace"
            >
              <ResizablePanel
                id="test-plan-case"
                order={1}
                defaultSize={78}
                minSize={50}
              >
                {workspace}
              </ResizablePanel>
              {sidebarVisible && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="test-plan-explorer"
                    order={2}
                    defaultSize={22}
                    minSize={16}
                    maxSize={40}
                  >
                    {explorer}
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          )}
        </div>
      )}
      {narrow && (
        <Sheet open={explorerOpen} onOpenChange={setExplorerOpen}>
          <SheetContent>
            <SheetTitle className="px-5 pt-5">Project explorer</SheetTitle>
            <SheetDescription className="sr-only">
              Browse projects and their test cases.
            </SheetDescription>
            <div className="min-h-0 flex-1">{explorer}</div>
          </SheetContent>
        </Sheet>
      )}
      <Dialog
        open={!!projectDialog}
        onOpenChange={(value) => {
          if (!value && !acting) setProjectDialog(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {projectDialog?.id ? "Rename project" : "New project"}
          </DialogTitle>
          <DialogDescription>
            Projects group related test cases and their product lists.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveProject();
            }}
          >
            <div className="field">
              <label htmlFor="tp-project-name">Project name</label>
              <Input
                autoFocus
                id="tp-project-name"
                maxLength={200}
                value={projectDialog?.name ?? ""}
                disabled={acting}
                onChange={(event) =>
                  setProjectDialog((current) =>
                    current
                      ? { ...current, name: event.target.value }
                      : current,
                  )
                }
              />
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={acting}
                onClick={() => setProjectDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={acting || !projectDialog?.name.trim()}
              >
                {acting
                  ? "Saving…"
                  : projectDialog?.id
                    ? "Rename project"
                    : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!importDocument}
        onOpenChange={(value) => {
          if (!value && !acting) setImportDocument(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            Import {importDocument?.project ? "project" : "test case"}
          </DialogTitle>
          <DialogDescription>
            {importDocument?.project
              ? `“${importDocument.project.name}” · ${importDocument.project.cases.length} test cases. A new project will be created.`
              : `“${importDocument?.testCase?.title}” will be added as a new case.`}{" "}
            Existing work stays unchanged. Imported cases start with a new
            revision history.
          </DialogDescription>
          {importDocument?.testCase && (
            <>
              <div className="field">
                <label id="tp-import-target">Destination project</label>
                <Select
                  value={importTarget}
                  onValueChange={setImportTarget}
                  disabled={acting}
                >
                  <SelectTrigger aria-labelledby="tp-import-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New project</SelectItem>
                    {projects.map((entry) => (
                      <SelectItem key={entry.id} value={String(entry.id)}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {importTarget === "new" && (
                <div className="field">
                  <label htmlFor="tp-import-name">Project name</label>
                  <Input
                    id="tp-import-name"
                    value={importName}
                    maxLength={200}
                    disabled={acting}
                    onChange={(event) => setImportName(event.target.value)}
                  />
                </div>
              )}
            </>
          )}
          {importError && (
            <p role="alert" className="text-destructive text-sm">
              {importError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={acting}
              onClick={() => setImportDocument(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                acting ||
                (!!importDocument?.testCase &&
                  importTarget === "new" &&
                  !importName.trim())
              }
              onClick={() => void confirmImport()}
            >
              {acting ? "Importing…" : "Import as new copies"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {history && saved && (
        <RevisionHistory caseId={saved.id} onClose={() => setHistory(false)} />
      )}
      {dialog}
    </div>
  );
}
