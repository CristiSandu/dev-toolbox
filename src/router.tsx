import { createBrowserRouter } from "react-router-dom";
import App from "./App";

import TaskGenerator from "./pages/TaskGenerator";
import XamlFormatter from "./pages/XamlFormatter";
import CodeGenerator from "./pages/CodeGenerator";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "task", element: <TaskGenerator /> },
      { path: "xaml", element: <XamlFormatter /> },
      { path: "codes", element: <CodeGenerator /> },
    ],
  },
]);
