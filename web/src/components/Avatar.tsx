// Small, deterministic initials avatar. Colour is derived from a stable seed
// (usually the email) so a person keeps the same colour everywhere.

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function hue(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

interface Props {
  name: string;
  seed?: string;
  size?: number;
  ring?: boolean;
  title?: string;
}

export function Avatar({ name, seed, size = 34, ring, title }: Props) {
  return (
    <span
      className={`avatar${ring ? " avatar-ring" : ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `hsl(${hue(seed ?? name)} 52% 46%)`,
      }}
      title={title ?? name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
