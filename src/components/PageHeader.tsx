import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  summary?: ReactNode;
};

export default function PageHeader({ title, description, eyebrow, actions, summary }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="page-title font-display text-lg font-semibold tracking-tight text-ink">{title}</h1>
      </div>
      {(summary || actions) && (
        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          {summary}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
    </header>
  );
}
