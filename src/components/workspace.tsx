import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

export function WorkspaceHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="workspace-heading"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="workspace-actions">{children}</div>}</div>;
}

export function EmptyState({ title, description, icon: Icon = Inbox, children }: { title: string; description: string; icon?: LucideIcon; children?: ReactNode }) {
  return <div className="empty-state"><Icon size={30} strokeWidth={1.4} aria-hidden="true" /><h3>{title}</h3><p>{description}</p>{children}</div>;
}
