import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "./solar";

export type RowAction = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
};

export default function RowActionMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative inline-flex justify-end">
      <button
        ref={trigger}
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-page-bg hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={`Open actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open && trigger.current) {
            const rect = trigger.current.getBoundingClientRect();
            const menuHeight = actions.length * 38 + 8;
            const above = window.innerHeight - rect.bottom < menuHeight + 12;
            setPosition({
              top: above ? Math.max(8, rect.top - menuHeight - 4) : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 4),
              left: Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168)),
            });
          }
          setOpen((value) => !value);
        }}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" aria-label={`${label} actions`} style={{ position: "fixed", top: position.top, left: position.left, zIndex: 10050 }} className="min-w-40 overflow-hidden rounded-lg border border-border bg-card-bg p-1">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => { setOpen(false); action.onSelect(); }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-page-bg disabled:cursor-not-allowed disabled:opacity-40 ${action.danger ? "text-danger" : "text-ink"}`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
