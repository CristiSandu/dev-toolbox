import { useLocation, Link } from "react-router-dom";
import { Laptop, ChevronRight } from "lucide-react";

const titles: Record<string, string> = { "/": "Workspace", "/task": "Tasks", "/xaml": "Text tools", "/codes": "Barcodes & QR" };
export function AppHeader() {
  const { pathname } = useLocation();
  return <header className="app-header">
    <div className="flex min-w-0 items-center gap-2.5">
      <Link to="/" className="header-brand">Dev Toolbox</Link><ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="truncate font-medium">{titles[pathname] ?? "Workspace"}</span>
    </div>
    <span className="local-status"><Laptop className="size-3.5" aria-hidden="true" /> On your device</span>
  </header>;
}
