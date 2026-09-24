import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, CreditCard, MoreVertical, Pencil, Plus, Search, Trash2, WalletCards } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import InitialsAvatar from "../components/InitialsAvatar";

type PaymentMethod = "bank_transfer" | "mobile_money" | "cash" | "other";
type PayableSession = { source: "employee" | "member"; punchInId?: string | null; punchOutId?: string | null; entryId?: string | null };
type PayrollPersonOption = { id: string; full_name: string | null; role: string | null; employment_type: string | null; kind: "employee" | "member" };
type PendingPayment = {
  key: string; personId: string; personName: string; personKind: "employee" | "member"; rate: number;
  role: string; employmentStatus: "full_time" | "part_time" | "contract" | "internship";
  regularMinutes: number; overtimeMinutes: number; regularAmount: number; overtimeAmount: number; totalAmount: number; sessions: PayableSession[]; avatarUrl?: string | null;
};
type PayrollFormValues = { key: string; personId?: string; personName?: string; personKind?: "employee" | "member"; role: string; employmentStatus: PendingPayment["employmentStatus"]; regularHours: number; overtimeHours: number; normalRate: number; overtimeBaseRate: number; note: string };
type PaymentRunItem = { id: string; payment_run_id: string; person_kind: string; person_id: string; person_name: string; person_role: string | null; employment_status: string | null; hourly_rate: number; regular_minutes: number; overtime_minutes: number; overtime_multiplier: number; regular_amount: number; overtime_amount: number; total_amount: number; payment_reference: string | null; note: string | null };
type PaymentRun = { id: string; run_date: string; payment_method: PaymentMethod; status: string; total_amount: number; created_at: string; payment_run_items?: PaymentRunItem[] };

const OVERTIME_MULTIPLIER = 2;
const money = {
  format: (amount: number) => `GHS ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
};
const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

function payrollSchemaHelp(message: string) {
  if (/employment_status|person_role|schema cache/i.test(message)) {
    return "Database column missing on payment_run_items. Run the ALTER TABLE migration in Supabase SQL Editor: ALTER TABLE public.payment_run_items ADD COLUMN IF NOT EXISTS employment_status text; ALTER TABLE public.payment_run_items ADD COLUMN IF NOT EXISTS person_role text; ALTER TABLE public.payment_run_items ADD COLUMN IF NOT EXISTS note text; NOTIFY pgrst, 'reload schema';";
  }
  if (/relation .*payment_runs.* does not exist|table .*payment_runs.* does not exist/i.test(message)) return "Payroll database step 1 is missing. Run 001_payment_runs.sql in the Supabase SQL Editor.";
  if (/relation .*payment_run_items.* does not exist|table .*payment_run_items.* does not exist/i.test(message)) return "Payroll database step 2 is missing. Run 002_payment_run_items.sql in the Supabase SQL Editor.";
  if (/relation .*payment_run_sessions.* does not exist|table .*payment_run_sessions.* does not exist|payment_run_id|paid_at/i.test(message)) return "Payroll database step 3 is missing. Run 003_payment_run_sessons.sql in the Supabase SQL Editor.";
  return message;
}

export default function PayrollPage() {
  const { profile } = useAuth();
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [payrollPeople, setPayrollPeople] = useState<PayrollPersonOption[]>([]);
  const [runs, setRuns] = useState<PaymentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [runDate, setRunDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingRun, setDeletingRun] = useState<PaymentRun | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingPending, setEditingPending] = useState<PendingPayment | null>(null);
  const [dismissingPending, setDismissingPending] = useState<PendingPayment | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => { void loadPayroll(); }, [profile?.id]);

  async function loadPayroll() {
    if (!profile?.id) return;
    setLoading(true); setError("");
    // Keep this roster query identical in spirit to the Schedule page. It must
    // not depend on the pending-payments RPC: staff still need to be visible
    // in the selector if payroll data has an error or is empty.
    const [pendingResult, profilesResult, membersResult] = await Promise.all([
      supabase.rpc("get_pending_payments"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("members").select("id, full_name").order("full_name"),
    ]);

    // Query payment_runs with safe column selection for payment_run_items to avoid PostgREST schema cache crashes
    let runsData: PaymentRun[] = [];
    const runsResult = await supabase
      .from("payment_runs")
      .select("id, run_date, payment_method, status, total_amount, created_at, payment_run_items(id, person_kind, person_id, person_name, hourly_rate, regular_minutes, overtime_minutes, total_amount)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (runsResult.error) {
      // Fallback query without nested items if schema cache has an issue with payment_run_items
      const fallbackRuns = await supabase
        .from("payment_runs")
        .select("id, run_date, payment_method, status, total_amount, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!fallbackRuns.error && fallbackRuns.data) {
        runsData = fallbackRuns.data as PaymentRun[];
      } else {
        setError(payrollSchemaHelp(fallbackRuns.error?.message || runsResult.error.message));
      }
    } else if (runsResult.data) {
      runsData = runsResult.data as PaymentRun[];
    }

    const roster = [
      ...((profilesResult.data || []) as Array<Pick<PayrollPersonOption, "id" | "full_name">>).map((person) => ({ ...person, role: "employee", employment_type: "full_time", kind: "employee" as const })),
      ...((membersResult.data || []) as Array<Pick<PayrollPersonOption, "id" | "full_name">>).map((person) => ({ ...person, role: "employee", employment_type: "full_time", kind: "member" as const })),
    ].sort((left, right) => (left.full_name || "").localeCompare(right.full_name || ""));
    setPayrollPeople(roster);

    if (pendingResult.error) {
      setError(payrollSchemaHelp(pendingResult.error.message));
      setLoading(false);
      return;
    }

    setPending(((pendingResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
      key: `${row.person_kind}:${row.person_id}`,
      personId: String(row.person_id), personName: String(row.person_name || "Unknown"),
      personKind: row.person_kind === "member" ? "member" : "employee", rate: Number(row.hourly_rate || 0),
      role: String(row.person_role || "employee"), employmentStatus: ["full_time", "part_time", "contract", "internship"].includes(String(row.employment_status)) ? String(row.employment_status) as PendingPayment["employmentStatus"] : "full_time",
      regularMinutes: Number(row.regular_minutes || 0), overtimeMinutes: Number(row.overtime_minutes || 0),
      regularAmount: Number(row.regular_amount || 0), overtimeAmount: Number(row.overtime_amount || 0), totalAmount: Number(row.total_amount || 0),
      sessions: Array.isArray(row.sessions) ? row.sessions as PayableSession[] : [],
    })));
    setRuns(runsData);
    if (profilesResult.error || membersResult.error) {
      setError("The payroll roster could not be fully loaded. Check that your account can read profiles and members.");
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? pending.filter((item) => `${item.personName} ${item.personKind} ${item.role} ${item.employmentStatus}`.toLowerCase().includes(query)) : pending;
  }, [pending, search]);
  const selected = pending.filter((item) => selectedKeys.includes(item.key));
  const total = selected.reduce((sum, item) => sum + item.totalAmount, 0);

  function toggle(key: string) { setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  function resetFlow() { setStep(0); setSelectedKeys([]); setReference(""); setRunDate(format(new Date(), "yyyy-MM-dd")); }

  function startPayroll() {
    setTab("pending");
    setStep(1);
    setSelectedKeys([]);
    setSuccess("");
  }



  async function deletePayroll(runId: string) {
    setDeleting(true); setError("");
    try {
      // Clear paid_at on punches and member_entries tied to this run before deleting
      const { error: punchErr } = await supabase.from("punches").update({ payment_run_id: null, paid_at: null }).eq("payment_run_id", runId);
      if (punchErr) console.warn("Punches reset warning:", punchErr);
      const { error: entryErr } = await supabase.from("member_entries").update({ payment_run_id: null, paid_at: null }).eq("payment_run_id", runId);
      if (entryErr) console.warn("Member entries reset warning:", entryErr);
      const { error: delError } = await supabase.from("payment_runs").delete().eq("id", runId);
      if (delError) throw delError;
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      setSuccess("Payroll entry deleted successfully.");
      setDeletingRun(null);
      await loadPayroll();
    } catch (err) {
      console.error("Delete payroll error:", err);
      setError(payrollSchemaHelp((err as Error).message || "Unable to delete payroll."));
    }
    finally { setDeleting(false); }
  }

  async function dismissPendingPayment(item: PendingPayment) {
    setDismissing(true); setError("");
    try {
      const punchIds = item.sessions.filter((s) => s.source === "employee").flatMap((s) => [s.punchInId, s.punchOutId].filter(Boolean));
      const entryIds = item.sessions.filter((s) => s.source === "member").map((s) => s.entryId).filter(Boolean);
      if (punchIds.length) {
        const { error: punchErr } = await supabase.from("punches").update({ paid_at: new Date().toISOString() }).in("id", punchIds);
        if (punchErr) throw punchErr;
      }
      if (entryIds.length) {
        const { error: entryErr } = await supabase.from("member_entries").update({ paid_at: new Date().toISOString() }).in("id", entryIds);
        if (entryErr) throw entryErr;
      }
      setPending((prev) => prev.filter((p) => p.key !== item.key));
      setSuccess(`Pending payment for ${item.personName} has been dismissed.`);
      setDismissingPending(null);
      await loadPayroll();
    } catch (err) {
      console.error("Dismiss pending payment error:", err);
      setError(payrollSchemaHelp((err as Error).message || "Unable to dismiss pending payment."));
    }
    finally { setDismissing(false); }
  }

  async function markAsPaid(values?: PayrollFormValues) {
    if (!profile?.id || (!selected.length && !values)) { setError("Select a staff member before adding payroll."); return; }
    const payable = values
      ? [pending.find((item) => item.key === values.key) || {
        key: values.key, personId: values.personId || "", personName: values.personName || "Unnamed", personKind: values.personKind || "employee",
        rate: 0, role: values.role, employmentStatus: values.employmentStatus, regularMinutes: 0, overtimeMinutes: 0,
        regularAmount: 0, overtimeAmount: 0, totalAmount: 0, sessions: [] as PayableSession[],
      }].map((item) => ({
        ...item,
        role: values.role,
        employmentStatus: values.employmentStatus,
        regularMinutes: Math.round(values.regularHours * 60),
        overtimeMinutes: Math.round(values.overtimeHours * 60),
        rate: values.normalRate,
        regularAmount: Number((values.regularHours * values.normalRate).toFixed(2)),
        overtimeAmount: Number((values.overtimeHours * values.overtimeBaseRate * OVERTIME_MULTIPLIER).toFixed(2)),
        totalAmount: Number((values.regularHours * values.normalRate + values.overtimeHours * values.overtimeBaseRate * OVERTIME_MULTIPLIER).toFixed(2)),
        note: values.note,
      }))
      : selected;
    const payrollTotal = payable.reduce((sum, item) => sum + item.totalAmount, 0);
    if (!payable.length) { setError("Choose a staff member from the payroll form."); return; }
    setSaving(true); setError("");
    try {
      const { data: run, error: runError } = await supabase.from("payment_runs").insert({ run_date: runDate, payment_method: method, total_amount: payrollTotal, created_by: profile.id }).select().single();
      if (runError || !run) throw runError || new Error("Could not create payment run.");

      let itemRows: { id: string; person_kind: string; person_id: string }[] | null = null;
      const { data: insertedRows, error: itemsError } = await supabase.from("payment_run_items").insert(payable.map((item) => ({
        payment_run_id: run.id,
        person_kind: item.personKind,
        person_id: item.personId,
        person_name: item.personName,
        person_role: item.role,
        employment_status: item.employmentStatus,
        hourly_rate: item.rate,
        regular_minutes: item.regularMinutes,
        overtime_minutes: item.overtimeMinutes,
        overtime_multiplier: OVERTIME_MULTIPLIER,
        regular_amount: item.regularAmount,
        overtime_amount: item.overtimeAmount,
        total_amount: item.totalAmount,
        payment_reference: reference || null,
        note: "note" in item ? item.note || null : null
      }))).select("id, person_kind, person_id");

      if (itemsError) {
        if (/employment_status|person_role|note|schema cache/i.test(itemsError.message)) {
          const { data: retryRows, error: retryError } = await supabase.from("payment_run_items").insert(payable.map((item) => ({
            payment_run_id: run.id,
            person_kind: item.personKind,
            person_id: item.personId,
            person_name: item.personName,
            hourly_rate: item.rate,
            regular_minutes: item.regularMinutes,
            overtime_minutes: item.overtimeMinutes,
            overtime_multiplier: OVERTIME_MULTIPLIER,
            regular_amount: item.regularAmount,
            overtime_amount: item.overtimeAmount,
            total_amount: item.totalAmount,
            payment_reference: reference || null
          }))).select("id, person_kind, person_id");
          if (retryError || !retryRows) {
            await supabase.from("payment_runs").delete().eq("id", run.id);
            throw retryError || new Error("Could not create payment items.");
          }
          itemRows = retryRows;
        } else {
          await supabase.from("payment_runs").delete().eq("id", run.id);
          throw itemsError;
        }
      } else {
        itemRows = insertedRows;
      }

      if (!itemRows) {
        await supabase.from("payment_runs").delete().eq("id", run.id);
        throw new Error("Could not create payment items.");
      }
      const itemByPerson = new Map(itemRows.map((item) => [`${item.person_kind}:${item.person_id}`, item.id]));
      const sessionRows = payable.flatMap((item) => item.sessions.map((session) => ({ payment_run_item_id: itemByPerson.get(item.key), punch_id: session.source === "employee" ? session.punchInId : null, member_entry_id: session.source === "member" ? session.entryId : null }))).filter((row) => row.payment_run_item_id);
      const { error: sessionsError } = await supabase.from("payment_run_sessions").insert(sessionRows);
      if (sessionsError) throw sessionsError;
      const punchIds = payable.flatMap((item) => item.sessions.filter((session) => session.source === "employee").flatMap((session) => [session.punchInId, session.punchOutId].filter(Boolean)));
      const entryIds = payable.flatMap((item) => item.sessions.filter((session) => session.source === "member").map((session) => session.entryId).filter(Boolean));
      if (punchIds.length) { const { error: punchError } = await supabase.from("punches").update({ payment_run_id: run.id, paid_at: new Date().toISOString() }).in("id", punchIds); if (punchError) throw punchError; }
      if (entryIds.length) { const { error: entryError } = await supabase.from("member_entries").update({ payment_run_id: run.id, paid_at: new Date().toISOString() }).in("id", entryIds); if (entryError) throw entryError; }
      setSuccess(`${payable.length} payroll ${payable.length === 1 ? "entry" : "entries"} added and marked as paid.`); resetFlow(); await loadPayroll();
    } catch (paymentError) { setError(payrollSchemaHelp((paymentError as Error).message || "Unable to record payment.")); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up"><div><div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"><WalletCards className="h-3.5 w-3.5" /> Activity</div><h2 className="mt-3 font-display text-2xl font-bold text-ink">Payroll</h2><p className="mt-1 text-sm text-ink-muted">Calculate unpaid completed time, then log manually completed payments.</p></div><div className="rounded-xl border border-border bg-card-bg px-4 py-3 text-right"><p className="text-xs text-ink-muted">Pending payments</p><p className="font-display text-xl font-bold text-ink">{pending.length}</p></div></div>
    {error && <div className="flex gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
    {success && <div className="flex gap-2 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border"><div className="flex gap-5"><button type="button" onClick={() => setTab("pending")} className={`border-b-2 px-1 pb-3 text-sm font-medium ${tab === "pending" ? "border-primary text-primary" : "border-transparent text-ink-muted"}`}>Pending payments</button><button type="button" onClick={() => setTab("history")} className={`border-b-2 px-1 pb-3 text-sm font-medium ${tab === "history" ? "border-primary text-primary" : "border-transparent text-ink-muted"}`}>Payment history</button></div><button type="button" onClick={startPayroll} className="btn-primary mb-2 text-sm"><Plus className="h-4 w-4" />Add payroll</button></div>
    {tab === "pending" ? (
      <>
        <div className="card flex flex-col gap-3 p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" /><input className="input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff, role, or employment status…" /></div></div>
        <div className="card overflow-x-auto"><div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3"><div><h3 className="font-display font-semibold text-ink">Staff with pending payments</h3><p className="mt-0.5 text-xs text-ink-muted">Completed unpaid attendance is ready to be added to payroll.</p></div><span className="badge badge-yellow">{filtered.length} pending</span></div><table className="w-full min-w-[1240px] text-sm"><thead className="bg-page-bg"><tr className="border-b border-border"><th className="table-header px-5 py-3 text-left">Staff</th><th className="table-header px-3 py-3 text-left">Role</th><th className="table-header px-3 py-3 text-left">Employment status</th><th className="table-header px-3 py-3 text-left">Sessions</th><th className="table-header px-3 py-3 text-left">Regular hours</th><th className="table-header px-3 py-3 text-left">Overtime · 2.0x</th><th className="table-header px-3 py-3 text-left">Payment status</th><th className="table-header px-3 py-3 text-left">Rate</th><th className="table-header px-3 py-3 text-right">Amount due</th><th className="table-header px-3 py-3 text-center w-12"></th></tr></thead><tbody>{loading ? <tr><td colSpan={10} className="px-5 py-12 text-center text-ink-muted">Loading unpaid completed attendance…</td></tr> : filtered.length === 0 ? <tr><td colSpan={10} className="px-5 py-12 text-center text-ink-muted">No unpaid completed attendance is ready for payment.</td></tr> : filtered.map((item) => <tr key={item.key} className="border-b border-border/60 last:border-0 hover:bg-page-bg"><td className="px-5 py-3"><div className="flex items-center gap-3"><InitialsAvatar name={item.personName} src={item.avatarUrl} size="sm" /><div><p className="font-medium text-ink">{item.personName}</p><p className="text-xs capitalize text-ink-muted">{item.personKind}</p></div></div></td><td className="px-3 py-3 capitalize text-ink-muted">{item.role}</td><td className="px-3 py-3 capitalize text-ink-muted">{item.employmentStatus.replace("_", " ")}</td><td className="px-3 py-3 text-ink-muted">{item.sessions.length}</td><td className="px-3 py-3 text-ink-muted">{duration(item.regularMinutes)}</td><td className="px-3 py-3 text-warn">{duration(item.overtimeMinutes)}</td><td className="px-3 py-3"><span className="badge badge-yellow">Pending</span></td><td className="px-3 py-3 text-ink-muted">{money.format(item.rate)}/hr</td><td className="px-3 py-3 text-right font-semibold text-ink">{money.format(item.totalAmount)}</td><td className="px-3 py-3 text-center"><PendingActionMenu item={item} isOpen={openMenuId === `pending:${item.key}`} onToggle={() => setOpenMenuId(openMenuId === `pending:${item.key}` ? null : `pending:${item.key}`)} onEdit={() => { setOpenMenuId(null); setEditingPending(item); }} onDelete={() => { setOpenMenuId(null); setDismissingPending(item); }} /></td></tr>)}</tbody></table></div>
      </>
    ) : (
      <div className="card overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-page-bg"><tr className="border-b border-border"><th className="table-header px-5 py-3 text-left">Run date</th><th className="table-header px-5 py-3 text-left">Payment method</th><th className="table-header px-5 py-3 text-left">People paid</th><th className="table-header px-5 py-3 text-left">Status</th><th className="table-header px-5 py-3 text-right">Total</th><th className="table-header px-3 py-3 text-center w-12">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-ink-muted">Loading payment history…</td></tr> : runs.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-ink-muted">No payments have been logged yet.</td></tr> : runs.map((run) => <tr key={run.id} className="border-b border-border/60 last:border-0 hover:bg-page-bg"><td className="px-5 py-3 text-ink">{format(parseISO(run.run_date), "MMM d, yyyy")}</td><td className="px-5 py-3 capitalize text-ink-muted">{run.payment_method.replace("_", " ")}</td><td className="px-5 py-3 text-ink-muted">{run.payment_run_items?.length || 0}</td><td className="px-5 py-3"><span className={"badge " + (run.status === "completed" ? "badge-green" : "badge-red")}>{run.status}</span></td><td className="px-5 py-3 text-right font-semibold text-ink">{money.format(Number(run.total_amount || 0))}</td><td className="px-3 py-3 text-center"><button type="button" onClick={() => setDeletingRun(run)} className="rounded-lg p-1.5 text-danger transition-colors hover:bg-danger/10" title="Delete payroll entry"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
    )}
    {deletingRun && <DeleteConfirmDialog run={deletingRun} deleting={deleting} onCancel={() => setDeletingRun(null)} onConfirm={() => void deletePayroll(deletingRun.id)} />}
    {editingPending && <EditPendingDialog item={editingPending} people={payrollPeople} pending={pending} method={method} reference={reference} runDate={runDate} saving={saving} onMethodChange={setMethod} onReferenceChange={setReference} onRunDateChange={setRunDate} onCancel={() => setEditingPending(null)} onSelect={(key: string) => setSelectedKeys(key ? [key] : [])} onSubmit={(values: PayrollFormValues) => { setEditingPending(null); void markAsPaid(values); }} />}
    {dismissingPending && <DismissPendingConfirmDialog item={dismissingPending} dismissing={dismissing} onCancel={() => setDismissingPending(null)} onConfirm={() => void dismissPendingPayment(dismissingPending)} />}
    {step > 0 && <PayrollEntryDialog people={payrollPeople} pending={pending} method={method} reference={reference} runDate={runDate} saving={saving} onMethodChange={setMethod} onReferenceChange={setReference} onRunDateChange={setRunDate} onCancel={resetFlow} onSelect={(key) => setSelectedKeys(key ? [key] : [])} onSubmit={(values) => void markAsPaid(values)} />}
  </div>;
}

function PayrollEntryDialog({ people, pending, method, reference, runDate, saving, onMethodChange, onReferenceChange, onRunDateChange, onSelect, onCancel, onSubmit }: { people: PayrollPersonOption[]; pending: PendingPayment[]; method: PaymentMethod; reference: string; runDate: string; saving: boolean; onMethodChange: (method: PaymentMethod) => void; onReferenceChange: (reference: string) => void; onRunDateChange: (date: string) => void; onSelect: (key: string) => void; onCancel: () => void; onSubmit: (values: PayrollFormValues) => void }) {
  const [activeKey, setActiveKey] = useState("");
  const [role, setRole] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState<PendingPayment["employmentStatus"]>("full_time");
  const [hoursType, setHoursType] = useState<"regular" | "overtime">("regular");
  const [rateType, setRateType] = useState<"normal" | "overtime">("normal");
  const [regularHours, setRegularHours] = useState(0);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [normalRate, setNormalRate] = useState(0);
  const [overtimeBaseRate, setOvertimeBaseRate] = useState(0);
  const [note, setNote] = useState("");
  const active = pending.find((item) => item.key === activeKey) || null;
  const selectedPerson = people.find((person) => `${person.kind}:${person.id}` === activeKey) || null;
  const activeHours = hoursType === "regular" ? regularHours : overtimeHours;
  const baseRate = rateType === "normal" ? normalRate : overtimeBaseRate;
  const effectiveRate = rateType === "overtime" ? baseRate * OVERTIME_MULTIPLIER : baseRate;
  const amount = (regularHours * normalRate) + (overtimeHours * overtimeBaseRate * OVERTIME_MULTIPLIER);

  function chooseStaff(key: string) {
    setActiveKey(key); onSelect(key);
    const item = pending.find((entry) => entry.key === key);
    const person = people.find((entry) => `${entry.kind}:${entry.id}` === key);
    if (!item) {
      setRole(person?.role || "employee");
      setEmploymentStatus("full_time");
      setRegularHours(0); setOvertimeHours(0); setNormalRate(0); setOvertimeBaseRate(0);
      return;
    }
    setRole(item.role); setEmploymentStatus(item.employmentStatus);
    setRegularHours(Number((item.regularMinutes / 60).toFixed(2))); setOvertimeHours(Number((item.overtimeMinutes / 60).toFixed(2)));
    setNormalRate(item.rate); setOvertimeBaseRate(item.rate);
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Payroll</p>
            <h3 className="mt-1 font-display text-xl font-bold text-ink">Add payroll</h3>
            <p className="mt-1 text-sm text-ink-muted">Completed unpaid hours are prefilled from the selected member’s attendance.</p>
          </div>
          <button type="button" className="btn-secondary px-3 py-2" onClick={onCancel}>Cancel</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">Name
            <select className="input mt-1" value={activeKey} onChange={(event) => chooseStaff(event.target.value)}>
              <option value="">Select employee or member</option>
              {people.map((person) => {
                const key = `${person.kind}:${person.id}`;
                return <option key={key} value={key}>{person.full_name || "Unnamed"} · {person.kind === "employee" ? "Employee" : "Member"}</option>;
              })}
            </select>
          </label>
          <label className="label">Role<input className="input mt-1" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role" /></label>
          <label className="label">Employment status
            <select className="input mt-1" value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value as PendingPayment["employmentStatus"])}>
              <option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="internship">Internship</option>
            </select>
          </label>
          <label className="label">Payroll date<input type="date" className="input mt-1" value={runDate} onChange={(event) => onRunDateChange(event.target.value)} /></label>
          <label className="label">Regular/Overtime hours
            <select className="input mt-1" value={hoursType} onChange={(event) => setHoursType(event.target.value as "regular" | "overtime")}><option value="regular">Regular hours</option><option value="overtime">Overtime hours</option></select>
          </label>
          <label className="label">{hoursType === "regular" ? "Regular hours" : "Overtime hours"}<input type="number" min="0" step="0.25" className="input mt-1" value={activeHours} onChange={(event) => hoursType === "regular" ? setRegularHours(Number(event.target.value)) : setOvertimeHours(Number(event.target.value))} /></label>
          <label className="label">Rate
            <select className="input mt-1" value={rateType} onChange={(event) => setRateType(event.target.value as "normal" | "overtime")}><option value="normal">Normal hours</option><option value="overtime">Overtime rate</option></select>
          </label>
          <label className="label">{rateType === "normal" ? "Normal hourly rate" : "Overtime base rate"}<input type="number" min="0" step="0.01" className="input mt-1" value={baseRate} onChange={(event) => rateType === "normal" ? setNormalRate(Number(event.target.value)) : setOvertimeBaseRate(Number(event.target.value))} /><span className="mt-1 block text-xs text-ink-muted">{rateType === "overtime" ? `${money.format(baseRate)} × 2 = ${money.format(effectiveRate)}/hr` : `${money.format(effectiveRate)}/hr`}</span></label>
          <label className="label">Payment method<select className="input mt-1" value={method} onChange={(event) => onMethodChange(event.target.value as PaymentMethod)}><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
          <label className="label">Reference <span className="font-normal text-ink-muted">(optional)</span><input className="input mt-1" value={reference} onChange={(event) => onReferenceChange(event.target.value)} placeholder="Transfer reference" /></label>
          <label className="label sm:col-span-2">Note<textarea className="input mt-1 resize-none" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional payroll note" /></label>
        </div>

        <div className="mt-5 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3"><p className="text-sm font-medium text-ink">Payment total: {money.format(amount)}</p><p className="mt-1 text-xs text-ink-muted">Regular: {regularHours}h × {money.format(normalRate)} · Overtime: {overtimeHours}h × {money.format(overtimeBaseRate)} × 2</p></div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="btn-primary" disabled={saving || !selectedPerson} onClick={() => selectedPerson && onSubmit({ key: activeKey, personId: selectedPerson.id, personName: selectedPerson.full_name || "Unnamed", personKind: selectedPerson.kind, role, employmentStatus, regularHours, overtimeHours, normalRate, overtimeBaseRate, note })}><CreditCard className="h-4 w-4" />{saving ? "Adding…" : "Add payroll"}</button></div>
      </div>
    </div>
  );
}

function PayrollFormDialog({ pending, selectedKeys, total, method, reference, runDate, saving, onToggle, onMethodChange, onReferenceChange, onRunDateChange, onCancel, onSubmit }: { pending: PendingPayment[]; selectedKeys: string[]; total: number; method: PaymentMethod; reference: string; runDate: string; saving: boolean; onToggle: (key: string) => void; onMethodChange: (method: PaymentMethod) => void; onReferenceChange: (reference: string) => void; onRunDateChange: (date: string) => void; onCancel: () => void; onSubmit: () => void }) {
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4"><div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Manual payroll</p><h3 className="mt-1 font-display text-xl font-bold text-ink">Add payroll</h3><p className="mt-1 text-sm text-ink-muted">Select staff, record how you paid them, and save the payment run.</p></div><button type="button" className="btn-secondary px-3 py-2" onClick={onCancel}>Cancel</button></div><div className="grid gap-4 sm:grid-cols-3"><label className="label">Payroll date<input type="date" className="input mt-1" value={runDate} onChange={(event) => onRunDateChange(event.target.value)} /></label><label className="label">Payment method<select className="input mt-1" value={method} onChange={(event) => onMethodChange(event.target.value as PaymentMethod)}><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label className="label">Reference <span className="font-normal text-ink-muted">(optional)</span><input className="input mt-1" value={reference} onChange={(event) => onReferenceChange(event.target.value)} placeholder="Transfer reference" /></label></div><div className="mt-6 overflow-hidden rounded-xl border border-border"><div className="flex items-center justify-between bg-page-bg px-4 py-3"><p className="text-sm font-semibold text-ink">Staff with pending payments</p><span className="text-xs text-ink-muted">Select one or more</span></div><div className="max-h-64 divide-y divide-border overflow-y-auto">{pending.length === 0 ? <p className="px-4 py-8 text-center text-sm text-ink-muted">There are no completed unpaid sessions to add.</p> : pending.map((item) => <label key={item.key} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-page-bg"><input type="checkbox" checked={selectedKeys.includes(item.key)} onChange={() => onToggle(item.key)} /><InitialsAvatar name={item.personName} size="sm" /><span className="min-w-0 flex-1"><span className="block font-medium text-ink">{item.personName}</span><span className="text-xs text-ink-muted">{duration(item.regularMinutes)} regular · {duration(item.overtimeMinutes)} overtime</span></span><strong className="text-sm text-ink">{money.format(item.totalAmount)}</strong></label>)}</div></div><div className="mt-5 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3"><p className="text-sm font-medium text-ink">{selectedKeys.length} staff selected · {money.format(total)}</p><p className="mt-1 text-xs text-ink-muted">This logs a payment already made outside AttendanceIQ. Selected sessions will no longer appear as pending.</p></div><div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="btn-primary" disabled={saving || selectedKeys.length === 0} onClick={onSubmit}><CreditCard className="h-4 w-4" />{saving ? "Adding…" : "Add payroll"}</button></div></div></div>;
}



/* ─── Delete confirmation dialog ─── */
function DeleteConfirmDialog({ run, deleting, onCancel, onConfirm }: { run: PaymentRun; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  const item = run.payment_run_items?.[0];
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10"><Trash2 className="h-5 w-5 text-danger" /></div>
          <h3 className="font-display text-lg font-bold text-ink">Delete payroll entry</h3>
        </div>
        <p className="mt-3 text-sm text-ink-muted">Are you sure you want to delete this payroll entry{item ? ` for ${item.person_name}` : ""}? This will permanently remove the payment record and un‑mark the associated sessions as paid so they return to the pending list.</p>
        <p className="mt-2 text-sm font-medium text-ink">Amount: {money.format(Number(run.total_amount || 0))} · {format(parseISO(run.run_date), "MMM d, yyyy")}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button type="button" className="rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-danger/90 disabled:opacity-50" disabled={deleting} onClick={onConfirm}>
            <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" />{deleting ? "Deleting…" : "Delete"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Three‑dot action menu per pending payment row ─── */
function PendingActionMenu({
  isOpen,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: PendingPayment;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-page-bg hover:text-ink"
        title="Actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card-bg shadow-lg animate-fade-up">
          <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-page-bg transition-colors"
          >
            <Pencil className="h-3.5 w-3.5 text-ink-muted" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Edit pending payroll dialog ─── */
function EditPendingDialog({
  item,
  people,
  pending,
  method,
  reference,
  runDate,
  saving,
  onMethodChange,
  onReferenceChange,
  onRunDateChange,
  onSelect,
  onCancel,
  onSubmit,
}: {
  item: PendingPayment;
  people: PayrollPersonOption[];
  pending: PendingPayment[];
  method: PaymentMethod;
  reference: string;
  runDate: string;
  saving: boolean;
  onMethodChange: (method: PaymentMethod) => void;
  onReferenceChange: (reference: string) => void;
  onRunDateChange: (date: string) => void;
  onSelect: (key: string) => void;
  onCancel: () => void;
  onSubmit: (values: PayrollFormValues) => void;
}) {
  const [activeKey, setActiveKey] = useState(item.key);
  const [role, setRole] = useState(item.role);
  const [employmentStatus, setEmploymentStatus] = useState<PendingPayment["employmentStatus"]>(item.employmentStatus);
  const [hoursType, setHoursType] = useState<"regular" | "overtime">("regular");
  const [rateType, setRateType] = useState<"normal" | "overtime">("normal");
  const [regularHours, setRegularHours] = useState(Number((item.regularMinutes / 60).toFixed(2)));
  const [overtimeHours, setOvertimeHours] = useState(Number((item.overtimeMinutes / 60).toFixed(2)));
  const [normalRate, setNormalRate] = useState(item.rate);
  const [overtimeBaseRate, setOvertimeBaseRate] = useState(item.rate);
  const [note, setNote] = useState("");

  const selectedPerson = people.find((person) => `${person.kind}:${person.id}` === activeKey) || {
    id: item.personId,
    full_name: item.personName,
    kind: item.personKind,
    role: item.role,
    avatar_url: item.avatarUrl,
  };

  const activeHours = hoursType === "regular" ? regularHours : overtimeHours;
  const baseRate = rateType === "normal" ? normalRate : overtimeBaseRate;
  const effectiveRate = rateType === "overtime" ? baseRate * OVERTIME_MULTIPLIER : baseRate;
  const regularAmount = Number((regularHours * normalRate).toFixed(2));
  const overtimeAmount = Number((overtimeHours * overtimeBaseRate * OVERTIME_MULTIPLIER).toFixed(2));
  const amount = regularAmount + overtimeAmount;

  function chooseStaff(key: string) {
    setActiveKey(key);
    onSelect(key);
    const foundPending = pending.find((entry) => entry.key === key);
    const person = people.find((entry) => `${entry.kind}:${entry.id}` === key);
    if (!foundPending) {
      setRole(person?.role || "employee");
      setEmploymentStatus("full_time");
      setRegularHours(0);
      setOvertimeHours(0);
      setNormalRate(0);
      setOvertimeBaseRate(0);
      return;
    }
    setRole(foundPending.role);
    setEmploymentStatus(foundPending.employmentStatus);
    setRegularHours(Number((foundPending.regularMinutes / 60).toFixed(2)));
    setOvertimeHours(Number((foundPending.overtimeMinutes / 60).toFixed(2)));
    setNormalRate(foundPending.rate);
    setOvertimeBaseRate(foundPending.rate);
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Payroll</p>
            <h3 className="mt-1 font-display text-xl font-bold text-ink">Edit payroll</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Completed unpaid hours are prefilled. You may adjust the payroll details before saving.
            </p>
          </div>
          <button type="button" className="btn-secondary px-3 py-2" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Name
            <select className="input mt-1" value={activeKey} onChange={(event) => chooseStaff(event.target.value)}>
              <option value="">Select employee or member</option>
              {people.map((person) => {
                const key = `${person.kind}:${person.id}`;
                return (
                  <option key={key} value={key}>
                    {person.full_name || "Unnamed"} · {person.kind === "employee" ? "Employee" : "Member"}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="label">
            Role
            <input className="input mt-1" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role" />
          </label>
          <label className="label">
            Employment status
            <select className="input mt-1" value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value as PendingPayment["employmentStatus"])}>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
          </label>
          <label className="label">
            Payroll date
            <input type="date" className="input mt-1" value={runDate} onChange={(event) => onRunDateChange(event.target.value)} />
          </label>
          <label className="label">
            Regular/Overtime hours
            <select className="input mt-1" value={hoursType} onChange={(event) => setHoursType(event.target.value as "regular" | "overtime")}>
              <option value="regular">Regular hours</option>
              <option value="overtime">Overtime hours</option>
            </select>
          </label>
          <label className="label">
            {hoursType === "regular" ? "Regular hours" : "Overtime hours"}
            <input
              type="number"
              min="0"
              step="0.25"
              className="input mt-1"
              value={activeHours}
              onChange={(event) =>
                hoursType === "regular"
                  ? setRegularHours(Number(event.target.value))
                  : setOvertimeHours(Number(event.target.value))
              }
            />
          </label>
          <label className="label">
            Rate
            <select className="input mt-1" value={rateType} onChange={(event) => setRateType(event.target.value as "normal" | "overtime")}>
              <option value="normal">Normal hours</option>
              <option value="overtime">Overtime rate</option>
            </select>
          </label>
          <label className="label">
            {rateType === "normal" ? "Normal hourly rate" : "Overtime base rate"}
            <input
              type="number"
              min="0"
              step="0.01"
              className="input mt-1"
              value={baseRate}
              onChange={(event) =>
                rateType === "normal"
                  ? setNormalRate(Number(event.target.value))
                  : setOvertimeBaseRate(Number(event.target.value))
              }
            />
            <span className="mt-1 block text-xs text-ink-muted">
              {rateType === "overtime"
                ? `${money.format(baseRate)} × 2 = ${money.format(effectiveRate)}/hr`
                : `${money.format(effectiveRate)}/hr`}
            </span>
          </label>
          <label className="label">
            Payment method
            <select className="input mt-1" value={method} onChange={(event) => onMethodChange(event.target.value as PaymentMethod)}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="mobile_money">Mobile money</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="label">
            Reference <span className="font-normal text-ink-muted">(optional)</span>
            <input className="input mt-1" value={reference} onChange={(event) => onReferenceChange(event.target.value)} placeholder="Transfer reference" />
          </label>
          <label className="label sm:col-span-2">
            Note
            <textarea className="input mt-1 resize-none" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional payroll note" />
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
          <p className="text-sm font-medium text-ink">Payment total: {money.format(amount)}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Regular: {regularHours}h × {money.format(normalRate)} · Overtime: {overtimeHours}h × {money.format(overtimeBaseRate)} × 2
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !selectedPerson}
            onClick={() =>
              selectedPerson &&
              onSubmit({
                key: activeKey,
                personId: selectedPerson.id,
                personName: selectedPerson.full_name || "Unnamed",
                personKind: selectedPerson.kind,
                role,
                employmentStatus,
                regularHours,
                overtimeHours,
                normalRate,
                overtimeBaseRate,
                note,
              })
            }
          >
            <CreditCard className="h-4 w-4" />
            {saving ? "Adding…" : "Add payroll"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Dismiss/Delete pending payment confirmation dialog ─── */
function DismissPendingConfirmDialog({
  item,
  dismissing,
  onCancel,
  onConfirm,
}: {
  item: PendingPayment;
  dismissing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10">
            <Trash2 className="h-5 w-5 text-danger" />
          </div>
          <h3 className="font-display text-lg font-bold text-ink">Delete pending payment</h3>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Are you sure you want to delete this pending payment for <strong>{item.personName}</strong>? This will remove it from the pending list and mark the {item.sessions.length} unpaid session(s) as resolved without creating a payment record.
        </p>
        <p className="mt-2 text-sm font-medium text-ink">
          Amount: {money.format(item.totalAmount)} · {item.sessions.length} session{item.sessions.length === 1 ? "" : "s"}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={dismissing}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
            disabled={dismissing}
            onClick={onConfirm}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              {dismissing ? "Deleting…" : "Delete"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

