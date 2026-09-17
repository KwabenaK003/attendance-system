export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} aria-hidden="true" />;
}
