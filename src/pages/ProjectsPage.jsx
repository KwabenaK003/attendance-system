import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { Plus, X, FolderKanban, Play, Square, DollarSign, Clock } from "lucide-react";

const STATUS_COLOR = { active: "badge-green", completed: "badge-blue", on_hold: "badge-yellow" };

export default function ProjectsPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [activeEntry, setActiveEntry] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", client: "", hourly_rate: "", budget_hours: "" });
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(null); // project id being tracked
  const [error, setError] = useState("");
  const isAdmin = profile?.role === "admin" || profile?.role === "manager";

  useEffect(() => {
    void fetchAll();
  }, [profile?.id]);

  async function fetchAll() {
    if (!profile?.id) {
      setProjects([]);
      setEntries([]);
      setActiveEntry(null);
      setTracking(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [{ data: projs, error: projectsError }, { data: ents, error: entriesError }] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("project_entries").select("*").eq("user_id", profile.id).is("punch_out", null).limit(1),
      ]);

      if (projectsError) throw projectsError;
      if (entriesError) throw entriesError;

      setProjects(projs || []);
      setEntries(ents || []);
      setActiveEntry(ents?.[0] || null);
      setTracking(ents?.[0]?.project_id || null);
    } catch (err) {
      setError(err.message || "Failed to load projects");
      setProjects([]);
      setEntries([]);
      setActiveEntry(null);
      setTracking(null);
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    if (!form.name || !profile?.id) return;

    setError("");

    const { error: createError } = await supabase.from("projects").insert({
      name: form.name,
      client: form.client,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
      budget_hours: parseFloat(form.budget_hours) || null,
      created_by: profile.id,
    });

    if (createError) {
      setError(createError.message || "Failed to create project");
      return;
    }

    setForm({ name: "", client: "", hourly_rate: "", budget_hours: "" });
    setShowForm(false);
    await fetchAll();
  }

  async function startTracking(projectId) {
    if (!profile?.id) {
      setError("Your account profile is still loading. Please try again.");
      return;
    }

    setError("");

    if (activeEntry) await stopTracking();
    const { data, error: trackError } = await supabase.from("project_entries").insert({
      user_id: profile.id,
      project_id: projectId,
      punch_in: new Date().toISOString(),
      billable: true,
    }).select().single();

    if (trackError) {
      setError(trackError.message || "Failed to start tracking");
      return;
    }

    setActiveEntry(data);
    setTracking(projectId);
  }

  async function stopTracking() {
    if (!activeEntry) return;

    setError("");

    const now = new Date();
    const hours = differenceInMinutes(now, parseISO(activeEntry.punch_in)) / 60;
    const { error: stopError } = await supabase.from("project_entries").update({
      punch_out: now.toISOString(),
      hours: parseFloat(hours.toFixed(2)),
    }).eq("id", activeEntry.id);

    if (stopError) {
      setError(stopError.message || "Failed to stop tracking");
      return;
    }

    setActiveEntry(null);
    setTracking(null);
    await fetchAll();
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Projects</h2>
          <p className="text-slate-400 text-sm mt-1">Track billable hours by project</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> New Project
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card p-6 border-accent/20 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">New Project</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Project Name *</label>
              <input className="input" placeholder="Website Redesign" value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">Client</label>
              <input className="input" placeholder="Acme Corp" value={form.client} onChange={set("client")} />
            </div>
            <div>
              <label className="label">Hourly Rate ($)</label>
              <input type="number" className="input" placeholder="100" value={form.hourly_rate} onChange={set("hourly_rate")} />
            </div>
            <div>
              <label className="label">Budget Hours</label>
              <input type="number" className="input" placeholder="120" value={form.budget_hours} onChange={set("budget_hours")} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createProject} className="btn-primary">Create Project</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Active tracking banner */}
      {activeEntry && (
        <div className="card-glow p-4 flex items-center gap-3 animate-fade-up">
          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
          <p className="text-accent font-medium text-sm flex-1">
            Tracking project time — started {format(parseISO(activeEntry.punch_in), "HH:mm")}
          </p>
          <button onClick={stopTracking} className="btn-danger flex items-center gap-2 text-sm py-1.5">
            <Square className="w-3 h-3" /> Stop
          </button>
        </div>
      )}

      {error && (
        <div className="card p-4 text-sm text-danger bg-danger/10 border-danger/20 animate-fade-up">
          {error}
        </div>
      )}

      {/* Projects grid */}
      {loading ? (
        <div className="card p-8 text-center text-slate-500">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderKanban className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500">No projects yet</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
          {projects.map((p) => {
            const isTracking = activeEntry?.project_id === p.id;
            return (
              <div key={p.id} className={`card p-5 flex flex-col gap-3 ${isTracking ? "border-accent/30" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-semibold text-white">{p.name}</h3>
                    {p.client && <p className="text-slate-500 text-xs mt-0.5">{p.client}</p>}
                  </div>
                  <span className={`badge ${STATUS_COLOR[p.status] || "badge-blue"} capitalize flex-shrink-0`}>{p.status}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800 rounded-lg px-3 py-2">
                    <p className="text-slate-500">Rate</p>
                    <p className="text-white font-medium mt-0.5 flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-accent" />{p.hourly_rate}/hr
                    </p>
                  </div>
                  <div className="bg-slate-800 rounded-lg px-3 py-2">
                    <p className="text-slate-500">Budget</p>
                    <p className="text-white font-medium mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-info" />{p.budget_hours ? `${p.budget_hours}h` : "—"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => isTracking ? stopTracking() : startTracking(p.id)}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
                    isTracking
                      ? "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20"
                      : "bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20"
                  }`}
                >
                  {isTracking ? <><Square className="w-3.5 h-3.5" /> Stop Tracking</> : <><Play className="w-3.5 h-3.5" /> Track Time</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
