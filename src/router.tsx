import { createBrowserRouter } from "react-router-dom";
import App from "./App";

import TaskGenerator from "./pages/TaskGenerator";
import { lazy, Suspense } from "react";
const XamlFormatter = lazy(() => import("./pages/XamlFormatter"));
const TestPlans = lazy(() => import("./pages/TestPlans"));
import CodeGenerator from "./pages/CodeGenerator";
import Home from "./pages/Home";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "task", element: <TaskGenerator /> },
      { path: "xaml", element: <Suspense fallback={<p role="status">Loading XML tools…</p>}><XamlFormatter /></Suspense> },
      { path: "codes", element: <CodeGenerator /> },
      { path: "test-plans", element: <Suspense fallback={<p role="status">Loading test plans…</p>}><TestPlans /></Suspense> },
    ],
  },
]);
