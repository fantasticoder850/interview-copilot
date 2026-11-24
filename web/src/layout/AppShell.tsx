import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  if (!user) return <>{children}</>;

  const links: { to: string; label: string }[] = [];
  if (user.role === "admin") links.push({ to: "/admin/users", label: "Users" });
  if (user.role === "admin" || user.role === "manager") {
    links.push({ to: "/resumes", label: "Resumes" });
  }
  links.push({ to: "/interviews", label: "Interviews" });

  return (
    <div className="shell">
      <header className="topnav">
        <button className="menu-btn" aria-label="Menu" onClick={() => setOpen((v) => !v)}>☰</button>
        <span className="brand">Interview Assistant</span>
        <nav className={`navlinks ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={loc.pathname.startsWith(l.to) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <span className="who">{user.name} · {user.role}</span>
        <button className="link-btn" onClick={() => logout()}>Sign out</button>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
