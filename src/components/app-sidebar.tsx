import { NavLink, useLocation } from "react-router-dom";
import { Home, GitBranch, Braces, QrCode, ClipboardList } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppUpdates } from "@/features/updater/AppUpdates";
import logo from "@/assets/app-icon-rail.png";

export const tools = [
  { to: "/task", label: "Tasks", description: "Branch names and PR titles", icon: GitBranch, shortcut: "1" },
  { to: "/xaml", label: "Text tools", description: "Format XML/JSON and compare text", icon: Braces, shortcut: "2" },
  { to: "/codes", label: "Barcodes & QR", description: "Single codes and batches", icon: QrCode, shortcut: "3" },
  { to: "/test-plans", label: "Test Plans", description: "Test cases and product code lists", icon: ClipboardList, shortcut: "4" },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  return <aside className="app-rail" aria-label="Tool navigation">
    <NavLink to="/" className="rail-brand" aria-label="Dev Toolbox home"><img src={logo} alt="" /></NavLink>
    <nav className="rail-links">
      {[{ to: "/", label: "Home", icon: Home, shortcut: "0" }, ...tools].map(item => <Tooltip key={item.to}>
        <TooltipTrigger asChild>
          <NavLink to={item.to} end={item.to === "/"} aria-label={item.label} className={`rail-link${pathname === item.to ? " is-active" : ""}`}>
            <item.icon aria-hidden="true" size={22} strokeWidth={1.7} />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}<span className="ml-3 opacity-70">{item.shortcut}</span></TooltipContent>
      </Tooltip>)}
    </nav>
    <div className="rail-utilities"><ThemeToggle /><AppUpdates /></div>
  </aside>;
}
