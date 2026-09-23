import { useRef, type ChangeEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import InitialsAvatar from "./InitialsAvatar";

type AvatarUploadProps = { name?: string | null; value?: string | null; onChange: (value: string) => void };

export default function AvatarUpload({ name, value, onChange }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 1_500_000) { window.alert("Choose an image smaller than 1.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = "";
  };
  return <div className="flex items-center gap-3"><InitialsAvatar name={name} src={value} size="sm" /><input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} /><button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => inputRef.current?.click()}><ImagePlus className="h-4 w-4" />{value ? "Change photo" : "Upload photo"}</button>{value && <button type="button" className="rounded-lg p-2 text-ink-muted hover:bg-danger/10 hover:text-danger" onClick={() => onChange("")} aria-label="Remove photo"><X className="h-4 w-4" /></button>}</div>;
}
