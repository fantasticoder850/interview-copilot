import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";

export interface AvatarOption {
  id: string;
  label: string;
  seed?: string; // stable seed for the avatar colour (e.g. email)
}

interface Props {
  options: AvatarOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  noun?: string; // singular noun, e.g. "manager"
}

interface Pos { left: number; width: number; top?: number; bottom?: number }

// A compact multi-select: the trigger shows up to three overlapping avatars, a
// "+N" overflow, and a count; the popover (rendered in a portal so the table
// never clips it) is a searchable, checkable list. The popover stays open while
// selecting; Done or a click outside closes it.
export function AvatarSelect({ options, selected, onChange, placeholder = "Assign managers", noun = "manager" }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const selectedOptions = useMemo(() => options.filter((o) => selected.includes(o.id)), [options, selected]);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? options.filter((o) => o.label.toLowerCase().includes(f) || (o.seed ?? "").toLowerCase().includes(f)) : options;
  }, [options, filter]);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 288);
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 340 && r.top > spaceBelow;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
    });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const reflow = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
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

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const count = selectedOptions.length;
  const avatars = selectedOptions.slice(0, 3);
  const overflow = count - avatars.length;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`avsel-trigger${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {count === 0 ? (
          <span className="avsel-placeholder">{placeholder}</span>
        ) : (
          <span className="avsel-value">
            <span className="avatar-stack">
              {avatars.map((o) => <Avatar key={o.id} name={o.label} seed={o.seed ?? o.id} size={24} ring />)}
              {overflow > 0 && <span className="avatar avatar-more" style={{ width: 24, height: 24, fontSize: 10 }}>+{overflow}</span>}
            </span>
            <span className="avsel-label">{count === 1 ? selectedOptions[0].label : `${count} ${noun}s`}</span>
          </span>
        )}
        <span className={`avsel-caret${open ? " is-open" : ""}`} aria-hidden>▾</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="avsel-pop"
          role="dialog"
          aria-label={placeholder}
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
        >
          <div className="avsel-pop-head">
            <span>{placeholder}</span>
            <span className="avsel-selected-count">{count} selected</span>
          </div>
          <input
            className="avsel-search"
            autoFocus
            placeholder={`Search ${noun}s…`}
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); const o = shown[active]; if (o) toggle(o.id); }
            }}
          />
          <div className="avsel-list" role="listbox" aria-multiselectable="true">
            {shown.length === 0 && <div className="avsel-empty">No {noun}s found</div>}
            {shown.map((o, i) => {
              const sel = selected.includes(o.id);
              return (
                <button
                  type="button"
                  key={o.id}
                  className={`avsel-option${sel ? " is-selected" : ""}${i === active ? " is-active" : ""}`}
                  role="option"
                  aria-selected={sel}
                  title={o.seed}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => toggle(o.id)}
                >
                  <Avatar name={o.label} seed={o.seed ?? o.id} size={28} />
                  <span className="avsel-option-label">{o.label}</span>
                  <span className={`avsel-box${sel ? " is-checked" : ""}`} aria-hidden>{sel ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="avsel-pop-foot">
            <button type="button" className="avsel-clear" onClick={() => onChange([])} disabled={count === 0}>Clear all</button>
            <button type="button" className="btn btn-sm primary" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>Done</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
