"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { googleAuth, loginWithPassword, guestLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AuthLogo } from "@/components/branding/AuthLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AuthPageGuard } from "@/components/auth/AuthPageGuard";

type LoginMode = "google" | "guest";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("google");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const applyLogin = (data: { access_token: string; user: { id: string; email: string } }) => {
    useAuthStore.getState().setAuth(data.access_token, data.user);
    toast.success("Logged in successfully");
    router.replace("/dashboard");
  };

  const errorMessage = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { detail?: string } } })?.response?.data
      ?.detail || (err instanceof Error ? err.message : fallback);

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      toast.error("Google sign-in failed");
      return;
    }
    setLoading(true);
    try {
      applyLogin(await googleAuth(credentialResponse.credential));
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter your email and password");
      return;
    }
    setLoading(true);
    try {
      applyLogin(await loginWithPassword(email.trim(), password));
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter your email and password");
      return;
    }
    setLoading(true);
    try {
      applyLogin(await guestLogin(email.trim(), password));
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageGuard>
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-8">
              <AuthLogo className="h-44 w-auto md:h-60" priority />
          </div>

          <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">Welcome back</h1>
              <p className="text-sm text-gray-500 mt-1">Sign in to your workspace.</p>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-border p-1 mb-6">
              <button
                type="button"
                onClick={() => setMode("google")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "google"
                    ? "bg-primary-600 text-white"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                Google
              </button>
              <button
                type="button"
                onClick={() => setMode("guest")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "guest"
                    ? "bg-primary-600 text-white"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                Guest
              </button>
            </div>

             {mode === "google" ? (
               <>
                 <div className="flex justify-center mb-5">
                   <div className={loading ? "pointer-events-none opacity-60" : ""}>
                     <GoogleLogin
                       onSuccess={handleGoogleSuccess}
                       onError={() => toast.error("Google sign-in failed")}
                     />
                   </div>
                 </div>
                 {loading && (
                   <p className="text-sm text-gray-500 text-center -mt-2 mb-4">Signing in...</p>
                 )}

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs uppercase tracking-wide text-gray-400">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="you@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Your DeskMind password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <Button type="submit" className="w-full" isLoading={loading}>
                    Sign in
                  </Button>
                </form>
              </>
            ) : (
              <form onSubmit={handleGuestLogin} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Your DeskMind password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
                <Button type="submit" className="w-full" isLoading={loading}>
                  Sign in
                </Button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-gray-500">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-150">
                Create one
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </AuthPageGuard>
  );
}