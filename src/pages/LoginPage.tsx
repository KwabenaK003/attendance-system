import { useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Building2, Eye, EyeOff } from "../components/solar";
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
    <div className="min-h-screen bg-white text-ink lg:grid lg:grid-cols-2">
      <aside className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-[#7047EB] px-7 py-8 text-white sm:px-10 lg:min-h-screen lg:px-14 lg:py-12 xl:px-20">
        <div className="pointer-events-none absolute inset-0 opacity-15" aria-hidden="true" style={{ backgroundImage: "radial-gradient(circle at 82% 18%, white 0 1px, transparent 1.5px)", backgroundSize: "24px 24px" }} />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Building2 className="h-5 w-5" /></div>
          <p className="font-display text-lg font-semibold">AttendanceIQ</p>
        </div>
        <div className="relative my-10 max-w-xl lg:my-0">
          <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl xl:text-6xl">Make every workday count.</h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/80">A simpler way to keep track of your people, time, and schedules.</p>
        </div>
        <p className="relative text-xs text-white/65">AttendanceIQ · Workforce operations</p>
      </aside>

      <main className="flex min-h-[calc(100vh-280px)] items-center justify-center px-5 py-12 sm:px-10 lg:min-h-screen lg:px-14">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-9">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
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
              <label className="label" htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                className="input"
                type="email"
                placeholder="admin@company.com"
                value={signInForm.email}
                onChange={setSignInField("email")}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  id="login-password"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted transition-colors hover:text-ink"
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

          <p className="mt-6 text-center text-xs text-ink-muted/70">
            AttendanceIQ © {new Date().getFullYear()}
          </p>
        </div>
      </main>
    </div>
  );
}
