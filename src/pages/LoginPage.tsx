import { useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Building2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getSafeRedirectPath } from "../lib/authRedirect";
import { SUPABASE_CONFIG_ERROR } from "../lib/supabase";

export default function LoginPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const redirectPath = getSafeRedirectPath(location.search);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [signInForm, setSignInForm] = useState({
    email: "",
    password: "",
  });

  const setSignInField = (key: keyof typeof signInForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setSignInForm((current) => ({ ...current, [key]: event.target.value }));
  };

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (SUPABASE_CONFIG_ERROR) {
        throw new Error(SUPABASE_CONFIG_ERROR);
      }

      const { error: signInError } = await signIn(signInForm.email.trim(), signInForm.password);
      if (signInError) {
        throw signInError;
      }

      navigate(redirectPath);
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl place-items-center gap-8">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 bg-accent/10">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-white">Attendance Management</h1>
              <p className="text-xs text-slate-500">Workforce attendance operations</p>
            </div>
          </div>

          <div className="card p-6 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">Sign in</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Use your organization account to continue.
                </p>
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {SUPABASE_CONFIG_ERROR && !error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-warn/20 bg-warn/10 px-4 py-3 text-sm text-warn">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {SUPABASE_CONFIG_ERROR}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSignIn}>
              <div>
                <label className="label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="admin@company.com"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary mt-6 flex w-full items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-600">
              Attendance Management © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
