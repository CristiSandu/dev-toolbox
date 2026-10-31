import type { ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function EditorPaneHeader({ title, canCopy, onCopy }: { title: string; canCopy: boolean; onCopy: () => void }) {
  return <div className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-2 px-4 py-2">
    <h2 className="truncate text-sm font-medium">{title}</h2>
    <Button variant="ghost" size="sm" disabled={!canCopy} onClick={onCopy} aria-label={`Copy ${title.toLowerCase()}`}><Copy aria-hidden="true" />Copy</Button>
  </div>;
}

export function EditorSurface({ header, children, footer }: { header: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return <Card className="h-full min-h-0 gap-0 overflow-hidden py-0">
    <div className="flex shrink-0 border-b bg-muted/30">{header}</div>
    <CardContent className="relative min-h-0 flex-1 overflow-hidden p-0">{children}</CardContent>
    {footer && <div className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground">{footer}</div>}
  </Card>;
}
