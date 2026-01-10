"use client";

import { useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar"; // <-- USE IT
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const TITLES: Record<string, string> = {
  "/task": "Task Generator",
  "/xaml": "XAML Formatter",
  "/diff": "Diff Viewer",
  "/codes": "Code Generator",
  "/print": "Print Queue",
  "/": "Dev Toolbox",
};

export function AppHeader() {
  const location = useLocation();
  const title = TITLES[location.pathname] ?? "Dev Toolbox";

  return (
    <header
      className={cn(
        "h-14 border-b flex items-center px-4 gap-4 bg-background/95",
        "backdrop-blur supports-backdrop-filter:bg-background/60",
        "sticky top-0 z-40"
      )}
    >
      {/* Sidebar toggle using shadcn component */}
      <SidebarTrigger />

      {/* Page Title */}
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme Toggle */}
      <ThemeToggle />
    </header>
  );
}
