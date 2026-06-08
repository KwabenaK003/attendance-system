import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { Users, Search, Shield, User, Briefcase } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmployeeRole = "admin" | "manager" | "employee";

interface Employee {
  id: string;
  full_name: string | null;
  role: EmployeeRole;
  department: string | null;
  hourly_rate: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<EmployeeRole, string> = {
  admin:    "badge-red",
  manager:  "badge-yellow",
  employee: "badge-green",
};

const ROLE_ICON: Record<EmployeeRole, React.ElementType> = {  // line 23 fix
  admin:    Shield,
  manager:  Briefcase,
  employee: User,
};


export default function EmployeesPage() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);           // line 28 fix
  const [loading, setLoading]     = useState<boolean>(true);
  const [search, setSearch]       = useState<string>("");

  useEffect(() => { void fetchEmployees(); }, []);

  async function fetchEmployees(): Promise<void> {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setEmployees((data as Employee[]) || []);
    setLoading(false);
  }

  async function updateRole(id: string, role: EmployeeRole): Promise<void> {  // line 32 fix
    await supabase.from("profiles").update({ role }).eq("id", id);
    void fetchEmployees();
  }

  async function updateDept(id: string, department: string): Promise<void> {
    await supabase.from("profiles").update({ department }).eq("id", id);
  }

  async function updateRate(id: string, rate: string): Promise<void> {
    await supabase.from("profiles").update({ hourly_rate: parseFloat(rate) || 0 }).eq("id", id);
  }

  const filtered = employees.filter(
    (e) =>
      !search ||
      e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = profile?.role === "admin";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-fade-up">
        <h2 className="font-display font-bold text-2xl text-white">Employees</h2>
        <p className="text-slate-400 text-sm mt-1">Manage your workforce</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 animate-fade-up">
        {[
          { label: "Total Employees", value: employees.length },
          { label: "Managers",        value: employees.filter((e) => e.role === "manager").length },
          { label: "Admins",          value: employees.filter((e) => e.role === "admin").length },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-slate-400 text-xs">{label}</p>
            <p className="font-display font-bold text-2xl text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative animate-fade-up">
        <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          className="input pl-10"
          placeholder="Search employees or departments…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>

      {/* Employee table */}
      <div className="card animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="table-header px-5 py-3 text-left">Employee</th>
                <th className="table-header px-5 py-3 text-left">Role</th>
                <th className="table-header px-5 py-3 text-left">Department</th>
                <th className="table-header px-5 py-3 text-left">Hourly Rate</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-slate-500">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10">
                    <Users className="w-7 h-7 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500">No employees found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const RoleIcon = ROLE_ICON[emp.role] ?? User;              // line 98 fix
                  return (
                    <tr key={emp.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">

                      {/* Employee name + avatar */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/15 flex items-center justify-center text-accent text-xs font-bold font-display flex-shrink-0">
                            {emp.full_name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="text-white font-medium">{emp.full_name ?? "Unknown"}</p>
                            {emp.id === profile?.id && (
                              <p className="text-accent text-xs">You</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3">
                        {isAdmin && emp.id !== profile?.id ? (
                          <select
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent/50"
                            value={emp.role}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                              void updateRole(emp.id, e.target.value as EmployeeRole)
                            }
                          >
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span className={`badge ${ROLE_BADGE[emp.role] ?? "badge-blue"} capitalize`}>
                            <RoleIcon className="w-3 h-3" />
                            {emp.role}
                          </span>
                        )}
                      </td>

                      {/* Department */}
                      <td className="px-5 py-3">
                        {isAdmin ? (
                          <input
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-accent/50 w-32"
                            placeholder="Department"
                            defaultValue={emp.department ?? ""}
                            onBlur={(e: React.FocusEvent<HTMLInputElement>) =>
                              void updateDept(emp.id, e.target.value)
                            }
                          />
                        ) : (
                          <span className="text-slate-400">{emp.department ?? "—"}</span>
                        )}
                      </td>

                      {/* Hourly rate */}
                      <td className="px-5 py-3">
                        {isAdmin ? (
                          <div className="relative w-24">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
                              $
                            </span>
                            <input
                              type="number"
                              className="bg-slate-800 border border-slate-700 rounded-lg pl-6 pr-2 py-1 text-xs text-white focus:outline-none focus:border-accent/50 w-full"
                              defaultValue={emp.hourly_rate ?? ""}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) =>   // line 124 fix
                                void updateRate(emp.id, e.target.value)
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-slate-400">${emp.hourly_rate ?? 0}/hr</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}