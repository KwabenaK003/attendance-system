import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SUPABASE_CONFIG_ERROR } from "../lib/supabase";
import { Zap, Eye, EyeOff, AlertCircle, Building2, ShieldCheck } from "lucide-react";
import FaceCaptureField from "../components/FaceCaptureField";
import { DEPARTMENT_OPTIONS, ROLE_OPTIONS } from "../lib/workforce";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "employee",
    companyName: "",
    department: DEPARTMENT_OPTIONS[0],
    faceEnrollment: null,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      if (SUPABASE_CONFIG_ERROR) {
        throw new Error(SUPABASE_CONFIG_ERROR);
      }

      if (mode === "login") {
        if (!form.role) {
          throw new Error("Please choose the role for this account");
        }

        const { error } = await signIn(form.email, form.password, form.role);
        if (error) throw error;
        navigate("/dashboard");
      } else {
        if (!form.fullName.trim()) {
          throw new Error("Please enter your full name");
        }

        if (!form.companyName.trim()) {
          throw new Error("Please enter your company name");
        }

        const { data, error } = await signUp({
          email: form.email,
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          companyName: form.companyName.trim(),
          department: form.department,
          faceReference: form.faceEnrollment?.reference || null,
        });
        if (error) throw error;

        if (!data?.session) {
          setMode("login");
          setError("Account created. Check your email to confirm it, then sign in.");
          return;
        }

        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 mb-4 clock-ring">
            <Zap className="w-7 h-7 text-accent" />
          </div>
          <h1 className="font-display font-bold text-3xl text-white">ChronoTrack</h1>
          <p className="text-slate-400 mt-1">Smart Employee Time Clock</p>
        </div>

        <div className="card p-6">
          {/* Mode toggle */}
          <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize ${
                  mode === m ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {SUPABASE_CONFIG_ERROR && !error && (
            <div className="flex items-center gap-2 text-warn text-sm bg-warn/10 border border-warn/20 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {SUPABASE_CONFIG_ERROR}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="label">Role</label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <select className="input pl-10" value={form.role} onChange={set("role")}>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              {mode === "login" ? (
                <p className="text-slate-500 text-xs mt-2">Pick the role assigned to this account before signing in.</p>
              ) : (
                <p className="text-slate-500 text-xs mt-2">Choose the access level for the new account.</p>
              )}
            </div>

            {mode === "register" && (
              <>
                <div>
                  <label className="label">Full Name</label>
                  <input className="input" placeholder="John Doe" value={form.fullName} onChange={set("fullName")} />
                </div>

                <div>
                  <label className="label">Company Name</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input className="input pl-10" placeholder="Acme Industries" value={form.companyName} onChange={set("companyName")} />
                  </div>
                </div>

                <div>
                  <label className="label">Department</label>
                  <select className="input" value={form.department} onChange={set("department")}>
                    {DEPARTMENT_OPTIONS.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="label">Email Address</label>
              <input className="input" type="email" placeholder="you@company.com" value={form.email} onChange={set("email")}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input className="input pr-12" type={showPass ? "text" : "password"} placeholder="••••••••"
                  value={form.password} onChange={set("password")}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
                <button onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <FaceCaptureField
                value={form.faceEnrollment}
                onChange={(faceEnrollment) => setForm((current) => ({ ...current, faceEnrollment }))}
                helperText="Capture a face now for quick Face Clock check-ins, or skip it and enroll later in Settings."
              />
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full mt-6 justify-center flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </>
            ) : (
              mode === "login" ? "Sign In" : "Create Account"
            )}
          </button>

          {mode === "login" && (
            <p className="text-center text-slate-500 text-sm mt-4">
              Sign in with the same role you chose when you created the account.
            </p>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          ChronoTrack © {new Date().getFullYear()} — Enterprise Time Tracking
        </p>
      </div>
    </div>
  );
}
