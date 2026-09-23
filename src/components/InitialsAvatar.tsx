type InitialsAvatarProps = {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const PALETTES = [
  "border-sky-500/20 bg-sky-500/15 text-sky-700",
  "border-violet-500/20 bg-violet-500/15 text-violet-700",
  "border-teal-500/20 bg-teal-500/15 text-teal-700",
  "border-amber-500/20 bg-amber-500/15 text-amber-700",
  "border-rose-500/20 bg-rose-500/15 text-rose-700",
] as const;

function initialsFromName(name?: string | null) {
  return name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function paletteForName(name?: string | null) {
  const hash = Array.from(name || "?").reduce((total, character) => total + character.charCodeAt(0), 0);
  return PALETTES[hash % PALETTES.length];
}

export default function InitialsAvatar({ name, src, size = "md", className = "" }: InitialsAvatarProps) {
  const sizeClass = {
    sm: "h-9 w-9 text-xs rounded-xl",
    md: "h-11 w-11 text-sm rounded-xl",
    lg: "h-14 w-14 text-base rounded-2xl",
  }[size];

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center border font-display font-bold ${sizeClass} ${paletteForName(name)} ${className}`}
      aria-label={name ? `${name} avatar` : "Person avatar"}
      title={name || "Unknown person"}
    >
      {initialsFromName(name)}
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full rounded-[inherit] object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
    </div>
  );
}
