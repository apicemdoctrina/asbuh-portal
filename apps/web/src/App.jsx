import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "./context/AuthContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import ToastContainer from "./components/ToastContainer.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Layout from "./components/Layout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";

// Frequently-hit pages — stay in main bundle
import OrganizationsPage from "./pages/OrganizationsPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import TicketsPage from "./pages/TicketsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import InvitePage from "./pages/InvitePage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

// Heavy / rarely-visited pages — split into async chunks
const OrganizationDetailPage = lazy(() => import("./pages/OrganizationDetailPage.jsx"));
const StaffPage = lazy(() => import("./pages/StaffPage.jsx"));
const ClientsPage = lazy(() => import("./pages/ClientsPage.jsx"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage.jsx"));
const WorkContactsPage = lazy(() => import("./pages/WorkContactsPage.jsx"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage.jsx"));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage.jsx"));
const KnowledgeArticlePage = lazy(() => import("./pages/KnowledgeArticlePage.jsx"));
const ManagementPage = lazy(() => import("./pages/ManagementPage.jsx"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage.jsx"));
const MyPaymentsPage = lazy(() => import("./pages/MyPaymentsPage.jsx"));
const MessageTemplatesPage = lazy(() => import("./pages/MessageTemplatesPage.jsx"));
const TicketDetailPage = lazy(() => import("./pages/TicketDetailPage.jsx"));
const ReportingPage = lazy(() => import("./pages/ReportingPage.jsx"));
const ClientGroupDetailPage = lazy(() => import("./pages/ClientGroupDetailPage.jsx"));

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
              <Route path="my-payments" element={<MyPaymentsPage />} />
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
