import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, ShieldCheck, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getSafeRedirectPath, withRedirect } from "../lib/authRedirect";
import { SUPABASE_CONFIG_ERROR } from "../lib/supabase";
import { DEPARTMENT_OPTIONS, ROLE_OPTIONS } from "../lib/workforce";

const ADMIN_ROLE_OPTION = { value: "admin", label: "Admin" };

export default function LoginPage({ mode = "signin" }) {
  const { signIn, signUp } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRegisterMode = mode === "register";
  const redirectPath = getSafeRedirectPath(location.search);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [signInForm, setSignInForm] = useState({
    email: "",
    password: "",
    role: "employee",
  });
  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    email: "",
    password: "",
    companyName: "",
    role: ADMIN_ROLE_OPTION.value,
    department: "",
  });

  const setSignInField = (key) => (event) => setSignInForm((current) => ({ ...current, [key]: event.target.value }));
  const setRegisterField = (key) => (event) => setRegisterForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSignIn(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (SUPABASE_CONFIG_ERROR) {
        throw new Error(SUPABASE_CONFIG_ERROR);
      }

      if (!signInForm.role) {
        throw new Error("Please choose the role for this account.");
      }

      const { error: signInError } = await signIn(signInForm.email.trim(), signInForm.password, signInForm.role);
      if (signInError) {
        throw signInError;
      }

      navigate(redirectPath);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (SUPABASE_CONFIG_ERROR) {
        throw new Error(SUPABASE_CONFIG_ERROR);
      }

      if (!registerForm.fullName.trim() || !registerForm.email.trim() || !registerForm.password || !registerForm.companyName.trim() || !registerForm.department) {
        throw new Error("Please complete every field to register the admin account.");
      }

      const { data, error: signUpError } = await signUp({
        email: registerForm.email.trim(),
        password: registerForm.password,
        fullName: registerForm.fullName.trim(),
        role: ADMIN_ROLE_OPTION.value,
        companyName: registerForm.companyName.trim(),
        department: registerForm.department,
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data?.session?.user) {
        navigate(redirectPath);
        return;
      }

      setSuccess("Admin account created. Check your email to confirm the account, then sign in.");
      setRegisterForm((current) => ({ ...current, password: "" }));
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 mb-4 clock-ring">
            <Zap className="w-7 h-7 text-accent" />
          </div>
          <h1 className="font-display font-bold text-3xl text-white">ChronoTrack</h1>
          <p className="text-slate-400 mt-1">Smart Employee Time Clock</p>
        </div>

        <div className="card p-6">
          <div className="mb-6">
            <div className="grid grid-cols-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-1">
              <Link
                to={withRedirect("/login", redirectPath)}
                className={`rounded-xl px-4 py-2 text-center text-sm font-medium transition-colors ${
                  !isRegisterMode
                    ? "bg-accent text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </Link>
              <Link
                to={withRedirect("/register", redirectPath)}
                className={`rounded-xl px-4 py-2 text-center text-sm font-medium transition-colors ${
                  isRegisterMode
                    ? "bg-accent text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Register
              </Link>
            </div>
            <h2 className="font-display text-xl font-semibold text-white mt-5">{isRegisterMode ? "Register Admin" : "Sign In"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isRegisterMode
                ? "Create an admin account with the company details needed to manage the system."
                : "Use your assigned account role to access the system."}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 mb-4">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {SUPABASE_CONFIG_ERROR && !error && (
            <div className="flex items-center gap-2 text-warn text-sm bg-warn/10 border border-warn/20 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {SUPABASE_CONFIG_ERROR}
            </div>
          )}

          {isRegisterMode ? (
            <form className="space-y-4" onSubmit={handleRegister}>
              <div>
                <label className="label">Full Name</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Jane Doe"
                  value={registerForm.fullName}
                  onChange={setRegisterField("fullName")}
                  required
                />
              </div>

              <div>
                <label className="label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="admin@company.com"
                  value={registerForm.email}
                  onChange={setRegisterField("email")}
                  required
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    className="input pr-12"
                    type={showPass ? "text" : "password"}
                    placeholder="Create a password"
                    value={registerForm.password}
                    onChange={setRegisterField("password")}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Company Name</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Acme Corporation"
                  value={registerForm.companyName}
                  onChange={setRegisterField("companyName")}
                  required
                />
              </div>

              <div>
                <label className="label">Role</label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <select
                    className="input pl-10"
                    value={registerForm.role}
                    onChange={setRegisterField("role")}
                    required
                  >
                    <option value={ADMIN_ROLE_OPTION.value}>{ADMIN_ROLE_OPTION.label}</option>
                  </select>
                </div>
                <p className="text-slate-500 text-xs mt-2">New registrations are limited to admin accounts.</p>
              </div>

              <div>
                <label className="label">Department</label>
                <select
                  className="input"
                  value={registerForm.department}
                  onChange={setRegisterField("department")}
                  required
                >
                  <option value="">Select a department</option>
                  {DEPARTMENT_OPTIONS.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6 justify-center flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Register Admin"
                )}
              </button>

              <p className="text-center text-slate-500 text-sm">
                Already have an admin account? <Link to={withRedirect("/login", redirectPath)} className="text-accent hover:text-accent/80">Sign in here</Link>.
              </p>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSignIn}>
              <div>
                <label className="label">Role</label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <select className="input pl-10" value={signInForm.role} onChange={setSignInField("role")}>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <p className="text-slate-500 text-xs mt-2">Pick the role assigned to this account before signing in.</p>
              </div>

              <div>
                <label className="label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@company.com"
                  value={signInForm.email}
                  onChange={setSignInField("email")}
                  required
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    className="input pr-12"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={signInForm.password}
                    onChange={setSignInField("password")}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6 justify-center flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>

              <p className="text-center text-slate-500 text-sm">
                Member records are managed inside the Members page after login.
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          ChronoTrack © {new Date().getFullYear()} - Enterprise Time Tracking
        </p>
      </div>
    </div>
  );
}
