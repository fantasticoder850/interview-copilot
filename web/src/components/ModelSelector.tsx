import type { Model } from "../types";

interface Props {
  models: Model[];
  value: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ models, value, disabled, onChange }: Props) {
  return (
    <select
      className="model-selector"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title="Model used for this session"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} — {m.description}
        </option>
      ))}
    </select>
  );
}
