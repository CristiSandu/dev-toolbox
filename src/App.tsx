import "./App.css";
import { AppSidebar } from "./components/app-sidebar";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "./components/ui/sidebar";

function App() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}

export default App;
