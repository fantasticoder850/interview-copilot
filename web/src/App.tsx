import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./layout/AppShell";
import type { Role } from "./types";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Users } from "./pages/admin/Users";
import { Resumes } from "./pages/Resumes";
import { ResumeForm } from "./pages/ResumeForm";
import { Interviews } from "./pages/Interviews";
import { InterviewForm } from "./pages/InterviewForm";
import { InterviewRoom } from "./pages/InterviewRoom";
import { Account } from "./pages/Account";

function Guard({ roles, children }: { roles?: Role[]; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/interviews" replace />;
  return children;
}

export function App() {
  const { user, loading } = useAuth();
  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/interviews" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/interviews" replace /> : <Register />} />

        <Route path="/admin/users" element={<Guard roles={["admin"]}><Users /></Guard>} />

        <Route path="/resumes" element={<Guard roles={["admin", "manager"]}><Resumes /></Guard>} />
        <Route path="/resumes/new" element={<Guard roles={["admin", "manager"]}><ResumeForm /></Guard>} />
        <Route path="/resumes/:id" element={<Guard roles={["admin", "manager"]}><ResumeForm /></Guard>} />

        <Route path="/interviews" element={<Guard><Interviews /></Guard>} />
        <Route path="/interviews/new" element={<Guard roles={["admin", "manager"]}><InterviewForm /></Guard>} />
        <Route path="/interviews/:id/edit" element={<Guard roles={["admin", "manager"]}><InterviewForm /></Guard>} />
        <Route path="/interviews/:id/room" element={<Guard><InterviewRoom /></Guard>} />

        <Route path="/account" element={<Guard><Account /></Guard>} />

        <Route path="*" element={loading ? <div className="page">Loading…</div> : <Navigate to={user ? "/interviews" : "/login"} replace />} />
      </Routes>
    </AppShell>
  );
}
