import "./App.css";
import { AppSidebar } from "./components/app-sidebar";
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppHeader } from "./components/app-header";
import { Toaster } from "sonner";

function App() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const route = ({ "0": "/", "1": "/task", "2": "/xaml", "3": "/codes", "4": "/test-plans" } as Record<string, string>)[event.key];
      if (route) { event.preventDefault(); navigate(route); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
  return (
    <TooltipProvider delayDuration={250}>
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <div className="app-shell">
        <AppSidebar />

        <div className="app-body">
          <AppHeader />
          <main id="workspace" tabIndex={-1} className="app-workspace">
            <Outlet />
            <Toaster richColors closeButton />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
