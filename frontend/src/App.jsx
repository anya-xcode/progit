import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import AccessGate from "./components/layout/AccessGate.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";
import { LoadingState } from "./components/ui/States.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import GitHubPage from "./pages/GitHubPage.jsx";
import MySolutionsPage from "./pages/MySolutionsPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ProblemLibraryPage from "./pages/ProblemLibraryPage.jsx";
import ProgressPage from "./pages/ProgressPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

// Pages with the Monaco editor are loaded on demand to keep startup fast.
const ProblemWorkspacePage = lazy(() => import("./pages/ProblemWorkspacePage.jsx"));
const CustomProblemPage = lazy(() => import("./pages/CustomProblemPage.jsx"));

const withSuspense = (element) => <Suspense fallback={<LoadingState className="h-full" />}>{element}</Suspense>;

export default function App() {
  return (
    <AccessGate>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="problems" element={<ProblemLibraryPage />} />
          <Route path="problems/new" element={withSuspense(<CustomProblemPage />)} />
          <Route path="problems/:slug/edit" element={withSuspense(<CustomProblemPage />)} />
          <Route path="problems/:slug" element={withSuspense(<ProblemWorkspacePage />)} />
          <Route path="solutions" element={<MySolutionsPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="github" element={<GitHubPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AccessGate>
  );
}
