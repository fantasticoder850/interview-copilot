import { useEffect, useMemo, useRef, useState } from "react";

interface Option {
  id: string;
  label: string;
  sub?: string;
}

interface Props {
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(f) || (o.sub ?? "").toLowerCase().includes(f));
  }, [options, filter]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const clearAll = () => onChange([]);

  const selectedOptions = options.filter((o) => selected.includes(o.id));

  return (
    <div className="multiselect" ref={rootRef}>
      <div className={`ms-control${open ? " is-open" : ""}`} onClick={() => setOpen((v) => !v)}>
        {selectedOptions.length === 0 ? (
          <span className="ms-placeholder">{placeholder ?? "Select…"}</span>
        ) : (
          <span className="ms-tags">
            {selectedOptions.map((o) => (
              <span key={o.id} className="ms-tag">
                {o.label}
                <button
                  type="button"
                  className="ms-tag-x"
                  aria-label={`Remove ${o.label}`}
                  onClick={(e) => { e.stopPropagation(); toggle(o.id); }}
                >
                  ×
                </button>
              </span>
            ))}
          </span>
        )}
        {selectedOptions.length > 0 && (
          <button
            type="button"
            className="ms-clear"
            aria-label="Clear all"
            onClick={(e) => { e.stopPropagation(); clearAll(); }}
          >
            ×
          </button>
        )}
        <span className={`ms-caret${open ? " is-open" : ""}`}>▾</span>
      </div>
      {open && (
        <div className="ms-menu">
          <input
            className="ms-filter"
            autoFocus
            placeholder="Search…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {shown.length === 0 && <div className="ms-empty">No matches</div>}
          {shown.map((o) => {
            const isSel = selected.includes(o.id);
            return (
              <button
                type="button"
                key={o.id}
                className={`ms-option${isSel ? " is-selected" : ""}`}
                onClick={() => toggle(o.id)}
              >
                <span className="ms-option-label">{o.label}</span>
                {isSel && <span className="ms-check" aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
