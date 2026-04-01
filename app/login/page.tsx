"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-ink/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-border/40" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Logo / Brand */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-ink rounded flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" fill="#F5F2EB" />
                <rect x="9" y="2" width="5" height="5" fill="#E8572A" />
                <rect x="2" y="9" width="5" height="5" fill="#E8572A" />
                <rect x="9" y="9" width="5" height="5" fill="#F5F2EB" />
              </svg>
            </div>
            <span className="font-display font-700 text-lg tracking-tight">Timesheet</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink leading-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted">Sign in to log your hours</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-mono font-medium text-muted uppercase tracking-widest mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 font-body text-sm focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-muted uppercase tracking-widest mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 font-body text-sm focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"
              />
            </div>

            {error && (
              <div className="text-xs text-accent font-mono bg-accent/8 border border-accent/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-6">
          Don&apos;t have an account? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
