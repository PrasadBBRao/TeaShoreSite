/**
 * AdminLogin.jsx — Admin login page.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const navigate  = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body?.detail || `Login failed (${res.status})`); return; }
      await login(body);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F6F0] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Wordmark */}
        <div className="mb-8 text-center">
          <p className="font-anton uppercase tracking-[0.18em] text-[#26372E] text-2xl">
            Teashore
          </p>
          <p className="mt-1 font-poppins text-xs font-semibold uppercase tracking-[0.22em] text-[#737C72]">
            Admin Panel
          </p>
        </div>

        <div className="rounded-2xl border border-[#E4E6DE] bg-white px-8 py-8 shadow-sm">
          <h1 className="font-poppins text-lg font-bold text-[#26372E] mb-6">
            Sign in to continue
          </h1>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="admin-username"
                className="block font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#737C72] mb-1.5">
                Username
              </label>
              <input
                id="admin-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                className="w-full rounded-lg border border-[#E4E6DE] bg-[#F7F6F0] px-4 py-2.5
                           font-sans text-sm text-[#26372E] placeholder:text-[#8A9488]
                           focus:outline-none focus:border-[#34483D] focus:ring-1 focus:ring-[#34483D]
                           disabled:opacity-50 transition-colors"
                placeholder="admin"
              />
            </div>

            <div>
              <label htmlFor="admin-password"
                className="block font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#737C72] mb-1.5">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full rounded-lg border border-[#E4E6DE] bg-[#F7F6F0] px-4 py-2.5
                           font-sans text-sm text-[#26372E] placeholder:text-[#8A9488]
                           focus:outline-none focus:border-[#34483D] focus:ring-1 focus:ring-[#34483D]
                           disabled:opacity-50 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5
                                         font-sans text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full rounded-lg bg-[#34483D] px-4 py-2.5 font-poppins text-sm
                         font-semibold text-white transition-all duration-150
                         hover:bg-[#26372E] active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center font-sans text-xs text-[#8A9488]">
          Staff access only · Not the customer site?{" "}
          <a href="/" className="text-[#34483D] hover:text-[#26372E] transition-colors underline underline-offset-2">
            Go to Teashore
          </a>
        </p>
      </div>
    </div>
  );
}
