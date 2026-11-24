import { useMemo, useState } from "react";

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

  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(f) || (o.sub ?? "").toLowerCase().includes(f));
  }, [options, filter]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const selectedLabels = options.filter((o) => selected.includes(o.id)).map((o) => o.label);

  return (
    <div className="multiselect">
      <div className="ms-control" onClick={() => setOpen((v) => !v)}>
        {selectedLabels.length === 0 ? (
          <span className="ms-placeholder">{placeholder ?? "Select…"}</span>
        ) : (
          <span className="ms-tags">
            {selectedLabels.map((l) => (
              <span key={l} className="ms-tag">{l}</span>
            ))}
          </span>
        )}
        <span className="ms-caret">▾</span>
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
          {shown.map((o) => (
            <label key={o.id} className="ms-option">
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              <span>{o.label}{o.sub ? <span className="ms-sub"> · {o.sub}</span> : null}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
