import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";

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
        <button className="menu-btn" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          ☰
        </button>
        <Link to="/interviews" className="brand">
          Interview&nbsp;<b>Copilot</b>
        </Link>
        <nav className={`navlinks ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={loc.pathname.startsWith(l.to) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <ThemeToggle />
          <Link to="/account" className="who" title="Account">
            {user.name} · {user.role}
          </Link>
          <button className="link-btn" onClick={() => logout()}>Sign out</button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
