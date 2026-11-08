import { createHashRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { CaseWorkspace } from "@/features/cases/CaseWorkspace";
import { SettingsView } from "@/features/settings/SettingsView";
import { ToolView } from "@/features/tools/ToolView";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/library" replace /> },
      { path: "library", element: <CaseWorkspace scope="all" /> },
      { path: "style", element: <CaseWorkspace scope="kind" kind="style" /> },
      { path: "motion", element: <CaseWorkspace scope="kind" kind="motion" /> },
      { path: "feedback", element: <CaseWorkspace scope="kind" kind="feedback" /> },
      { path: "component", element: <CaseWorkspace scope="kind" kind="component" /> },
      { path: "theme", element: <CaseWorkspace scope="kind" kind="theme" /> },
      { path: "favorites", element: <CaseWorkspace scope="favorites" /> },
      { path: "recent", element: <CaseWorkspace scope="recent" /> },
      { path: "workspace", element: <ToolView section="workspace" /> },
      { path: "discovery", element: <ToolView section="discovery" /> },
      { path: "settings", element: <SettingsView /> },
      { path: "*", element: <Navigate to="/library" replace /> },
    ],
  },
]);
