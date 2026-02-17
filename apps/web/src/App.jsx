import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Layout from "./components/Layout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SectionsPage from "./pages/SectionsPage.jsx";
import SectionDetailPage from "./pages/SectionDetailPage.jsx";
import OrganizationsPage from "./pages/OrganizationsPage.jsx";
import OrganizationDetailPage from "./pages/OrganizationDetailPage.jsx";
import StaffPage from "./pages/StaffPage.jsx";
import WorkContactsPage from "./pages/WorkContactsPage.jsx";
import AuditLogPage from "./pages/AuditLogPage.jsx";
import KnowledgePage from "./pages/KnowledgePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="sections" element={<SectionsPage />} />
            <Route path="sections/:id" element={<SectionDetailPage />} />
            <Route path="organizations" element={<OrganizationsPage />} />
            <Route path="organizations/:id" element={<OrganizationDetailPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="contacts" element={<WorkContactsPage />} />
            <Route path="knowledge" element={<KnowledgePage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
