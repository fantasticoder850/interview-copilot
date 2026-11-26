import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  actions: MenuAction[];
  label?: string;
}

// A three-dot overflow menu. The menu is rendered in a portal (fixed-positioned
// off the button) so it is never clipped by the table container.
export function ActionMenu({ actions, label = "Actions" }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const reflow = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", reflow);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`action-dots${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && pos && createPortal(
        <div ref={popRef} className="menu-pop" role="menu" style={{ position: "fixed", top: pos.top, right: pos.right }}>
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`menu-item${a.danger ? " is-danger" : ""}`}
              onClick={() => { setOpen(false); a.onClick(); }}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
