import { createBrowserRouter } from "react-router-dom";
import App from "./App";

import TaskGenerator from "./pages/TaskGenerator";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [{ path: "task", element: <TaskGenerator /> }],
  },
]);
