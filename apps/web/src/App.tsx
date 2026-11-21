import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { container } from "./components/ui.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { JobsPage } from "./pages/JobsPage.tsx";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="*" element={<p className={`${container} py-16 text-sm text-zinc-500`}>Page not found.</p>} />
      </Routes>
    </Layout>
  );
}
