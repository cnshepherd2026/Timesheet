"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    if (searchParams.get("error") === "invalid_link") {
      setError("This invite link has expired. Please ask your administrator to resend the invite.");
    }
    // Handle hash fragment tokens from Supabase (recovery/invite)
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("type=invite")) {
      // Extract tokens and set session, then redirect to set-password
      const params = new URLSearchParams(hash.replace("#", ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).then(() => {
          window.history.replaceState(null, "", window.location.pathname);
          router.push("/set-password");
        });
      }
    } else if (hash.includes("error=access_denied") || hash.includes("otp_expired") || hash.includes("error_code=")) {
      setError("This invite link has expired or is invalid. Please ask your administrator to resend the invite.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else { router.push("/dashboard"); router.refresh(); }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });
    setForgotSent(true);
    setLoading(false);
  }

  return (
    <div className="relative w-full max-w-sm animate-fade-up">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-ink rounded flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" fill="#F5F2EB"/>
              <rect x="9" y="2" width="5" height="5" fill="#E8572A"/>
              <rect x="2" y="9" width="5" height="5" fill="#E8572A"/>
              <rect x="9" y="9" width="5" height="5" fill="#F5F2EB"/>
            </svg>
          </div>
          <span className="font-display font-bold text-lg tracking-tight">Timesheet</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-ink leading-tight">
          {showForgot ? "Reset password" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {showForgot ? "Enter your email and we'll send a reset link." : "Sign in to log your hours"}
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
        {showForgot ? (
          forgotSent ? (
            <div className="text-center space-y-4">
              <div className="text-3xl">📬</div>
              <p className="text-sm text-ink font-body">Check your email for a password reset link.</p>
              <button onClick={() => { setShowForgot(false); setForgotSent(false); }}
                className="text-xs font-mono text-muted hover:text-ink transition-colors">
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-5">
              <div>
                <label className="block text-xs font-mono font-medium text-muted uppercase tracking-widest mb-2">Email</label>
                <input type="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 font-body text-sm focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 px-4 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-50">
                {loading ? "Sending…" : "Send reset link →"}
              </button>
              <button type="button" onClick={() => setShowForgot(false)}
                className="w-full text-xs font-mono text-muted hover:text-ink transition-colors text-center">
                ← Back to sign in
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-mono font-medium text-muted uppercase tracking-widest mb-2">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 font-body text-sm focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-muted uppercase tracking-widest mb-2">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 font-body text-sm focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
            </div>

            {error && (
              <div className="text-xs text-accent font-mono bg-accent/8 border border-accent/20 rounded-lg px-3 py-2">{error}</div>
            )}
            {info && (
              <div className="text-xs text-ink font-mono bg-ink/5 border border-border rounded-lg px-3 py-2">{info}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 px-4 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2">
              {loading ? "Signing in…" : "Sign in →"}
            </button>

            <button type="button" onClick={() => setShowForgot(true)}
              className="w-full text-xs font-mono text-muted hover:text-ink transition-colors text-center pt-1">
              Forgot password?
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-muted mt-6">
        Don&apos;t have an account? Contact your administrator.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/8 blur-3xl"/>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-ink/5 blur-3xl"/>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-border/40"/>
      </div>
      <Suspense fallback={<div className="font-mono text-sm text-muted animate-pulse">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
