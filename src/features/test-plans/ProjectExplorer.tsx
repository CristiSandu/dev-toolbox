import { useRef } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  FolderPlus,
  Download,
  FileDown,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/workspace";
import type { TestCase, TestProject } from "./model";

interface Props {
  projects: TestProject[];
  cases: TestCase[];
  selectedProject: number | null;
  selectedCase: number | null;
  expanded: number[];
  onExpanded: (ids: number[]) => void;
  disabled: boolean;
  onProject: (id: number) => void;
  onCase: (entry: TestCase) => void;
  onNewProject: () => void;
  onRenameProject: (entry: TestProject) => void;
  onDeleteProject: (entry: TestProject) => void;
  onNewCase: (projectId: number) => void;
  onDeleteCase: (entry: TestCase) => void;
  onExportProject: (entry: TestProject) => void;
  onExportCase: (entry: TestCase) => void;
  onExportPdf: (entry: TestCase, codesOnly?: boolean) => void;
  onHide: () => void;
}
export function ProjectExplorer(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const toggle = (id: number) =>
    props.onExpanded(
      props.expanded.includes(id)
        ? props.expanded.filter((value) => value !== id)
        : [...props.expanded, id],
    );
  return (
    <section className="pane tp-explorer h-full" aria-label="Project explorer">
      <div className="pane-heading">
        <h2>Projects</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Hide project sidebar"
          onClick={props.onHide}
        >
          <PanelRightClose />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New project"
          disabled={props.disabled}
          onClick={props.onNewProject}
        >
          <FolderPlus />
        </Button>
      </div>
      <div
        ref={root}
        className="tp-tree"
        role="tree"
        aria-label="Projects and test cases"
        onKeyDown={(event) => {
          const item = (event.target as HTMLElement).closest<HTMLElement>(
            "[role=treeitem]",
          );
          if (!item || event.target !== item) return;
          const items = [
            ...root.current!.querySelectorAll<HTMLElement>("[role=treeitem]"),
          ];
          const index = items.indexOf(item);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            items[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        items.length - 1,
                        index + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    )
            ]?.focus();
          }
          if (event.key === "ArrowRight" && item.dataset.project) {
            event.preventDefault();
            if (item.getAttribute("aria-expanded") === "false")
              toggle(Number(item.dataset.project));
            else items[index + 1]?.focus();
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (
              item.dataset.project &&
              item.getAttribute("aria-expanded") === "true"
            )
              toggle(Number(item.dataset.project));
            else
              root.current
                ?.querySelector<HTMLElement>(
                  `[data-project="${item.dataset.parent}"]`,
                )
                ?.focus();
          }
        }}
      >
        {!props.projects.length && (
          <EmptyState
            icon={Folder}
            title="Create your first project"
            description="Group test cases and product code lists in one place."
          />
        )}
        {props.projects.map((project) => {
          const expanded = props.expanded.includes(project.id),
            cases = props.cases.filter(
              (entry) => entry.projectId === project.id,
            );
          return (
            <div key={project.id} role="none">
              <div className="tp-tree-row">
                <button
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={expanded}
                  aria-selected={
                    props.selectedProject === project.id && !props.selectedCase
                  }
                  data-project={project.id}
                  className="tp-tree-select"
                  disabled={props.disabled}
                  onClick={() => {
                    toggle(project.id);
                    props.onProject(project.id);
                  }}
                >
                  <ChevronRight
                    className={expanded ? "rotate-90" : ""}
                    size={14}
                  />
                  {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                  <span>{project.name}</span>
                  <small>{cases.length}</small>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${project.name}`}
                      disabled={props.disabled}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => props.onNewCase(project.id)}
                    >
                      <Plus />
                      New test case
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => props.onExportProject(project)}
                    >
                      <Download /> Export project JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => props.onRenameProject(project)}
                    >
                      Rename project
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => props.onDeleteProject(project)}
                      className="text-destructive"
                    >
                      Delete project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {expanded && (
                <div role="group" aria-label={`${project.name} cases`}>
                  {cases.map((entry) => (
                    <div className="tp-tree-row tp-tree-case" key={entry.id}>
                      <button
                        role="treeitem"
                        aria-level={2}
                        aria-selected={props.selectedCase === entry.id}
                        data-parent={project.id}
                        className="tp-tree-select"
                        disabled={props.disabled}
                        onClick={() => props.onCase(entry)}
                      >
                        <FileText size={15} />
                        <span>{entry.content.title}</span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${entry.content.title}`}
                            disabled={props.disabled}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => props.onCase(entry)}
                          >
                            Open / edit test case
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => props.onExportCase(entry)}
                          >
                            <Download /> Export case JSON
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => props.onExportPdf(entry)}
                          >
                            <FileDown /> Export case PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => props.onExportPdf(entry, true)}
                          >
                            <FileDown /> Export codes-only PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => props.onDeleteCase(entry)}
                            className="text-destructive"
                          >
                            Delete test case
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                  <Button
                    className="tp-new-case"
                    variant="ghost"
                    size="sm"
                    disabled={props.disabled}
                    onClick={() => props.onNewCase(project.id)}
                  >
                    <Plus />
                    New test case
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="pane-footer">Saved on this device</div>
    </section>
  );
}
