import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "./context/AuthContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import ToastContainer from "./components/ToastContainer.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Layout from "./components/Layout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";

import OrganizationsPage from "./pages/OrganizationsPage.jsx";
import OrganizationDetailPage from "./pages/OrganizationDetailPage.jsx";
import StaffPage from "./pages/StaffPage.jsx";
import ClientsPage from "./pages/ClientsPage.jsx";
import UserProfilePage from "./pages/UserProfilePage.jsx";
import WorkContactsPage from "./pages/WorkContactsPage.jsx";
import AuditLogPage from "./pages/AuditLogPage.jsx";
import KnowledgePage from "./pages/KnowledgePage.jsx";
import ManagementPage from "./pages/ManagementPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import InvitePage from "./pages/InvitePage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import MessageTemplatesPage from "./pages/MessageTemplatesPage.jsx";
import KnowledgeArticlePage from "./pages/KnowledgeArticlePage.jsx";
import TicketsPage from "./pages/TicketsPage.jsx";
import TicketDetailPage from "./pages/TicketDetailPage.jsx";
import ReportingPage from "./pages/ReportingPage.jsx";
import ClientGroupDetailPage from "./pages/ClientGroupDetailPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <ToastContainer />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />

              <Route path="organizations" element={<OrganizationsPage />} />
              <Route path="organizations/:id" element={<OrganizationDetailPage />} />
              <Route path="client-groups/:id" element={<ClientGroupDetailPage />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="users/:id" element={<UserProfilePage />} />
              <Route path="contacts" element={<WorkContactsPage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="knowledge/:id" element={<KnowledgeArticlePage />} />
              <Route path="audit-log" element={<AuditLogPage />} />
              <Route path="management" element={<ManagementPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="tickets/:id" element={<TicketDetailPage />} />
              <Route path="reporting" element={<ReportingPage />} />
              <Route path="message-templates" element={<MessageTemplatesPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
