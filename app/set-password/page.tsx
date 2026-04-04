"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Give supabase-js a moment to hydrate the session from storage
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      } else {
        setError("Session not found. Please use the link in your email or request a new one.");
      }
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error, data } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data?.user) {
      await supabase.from("profiles").upsert({ id: data.user.id }, { onConflict: "id", ignoreDuplicates: true } as any);
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/8 blur-3xl"/>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-ink/5 blur-3xl"/>
      </div>

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
            <span className="font-display font-bold text-lg tracking-tight">JYM Timesheet</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink leading-tight">Set your password</h1>
          <p className="mt-2 text-sm text-muted">Choose a password to access your account.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          {loading ? (
            <div className="text-center py-4">
              <div className="font-mono text-sm text-muted animate-pulse">Verifying your link…</div>
            </div>
          ) : !sessionReady ? (
            <div className="text-center space-y-4">
              <div className="text-3xl">🔗</div>
              <div className="text-xs text-accent font-mono bg-accent/8 border border-accent/20 rounded-lg px-3 py-2">{error}</div>
              <button onClick={() => router.push("/login")}
                className="w-full py-3 px-4 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 transition-all">
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-mono font-medium text-muted uppercase tracking-widest mb-2">New password</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 font-body text-sm focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
              </div>
              <div>
                <label className="block text-xs font-mono font-medium text-muted uppercase tracking-widest mb-2">Confirm password</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 font-body text-sm focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
              </div>

              {error && (
                <div className="text-xs text-accent font-mono bg-accent/8 border border-accent/20 rounded-lg px-3 py-2">{error}</div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3 px-4 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                {loading ? "Setting password…" : "Set password & sign in →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
