import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Zap } from "lucide-react";
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

  const setSignInField = (key) => (event) => setSignInForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSignIn(event) {
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
            <h2 className="font-display text-xl font-semibold text-white">Sign In</h2>
            <p className="mt-1 text-sm text-slate-500">
              Admin access is applied automatically for signed-in users.
            </p>
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
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          ChronoTrack © {new Date().getFullYear()} - Enterprise Time Tracking
        </p>
      </div>
    </div>
  );
}
