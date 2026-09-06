"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { googleSignup, guestSignup } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AuthLogo } from "@/components/branding/AuthLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AuthPageGuard } from "@/components/auth/AuthPageGuard";

type SignupMode = "google" | "guest";

export default function SignupPage() {
  const [mode, setMode] = useState<SignupMode>("google");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const applyLogin = (data: { access_token: string; user: { id: string; email: string } }) => {
    useAuthStore.getState().setAuth(data.access_token, data.user);
    toast.success("Account created!");
    router.replace("/dashboard");
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      toast.error("Google sign-in failed");
      return;
    }
    if (password.length < 8) {
      toast.error("Please choose a password of at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const data = await googleSignup(credentialResponse.credential, password);
      applyLogin(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || (err instanceof Error ? err.message : "Signup failed");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const data = await guestSignup(name.trim(), email.trim(), password);
      applyLogin(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || (err instanceof Error ? err.message : "Signup failed");
      toast.error(message);
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
              <h1 className="text-xl font-bold text-gray-900">Create account</h1>
              <p className="text-sm text-gray-500 mt-1">
                Choose how you want to sign up.
              </p>
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
                <div className="space-y-4">
                  <div>
                    <Input
                      label="DeskMind Password"
                      type="password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="new-password"
                    />
                    <Input
                      label="Confirm Password"
                      type="password"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="new-password"
                      className="mt-3"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  You&apos;ll sign in later with your Google email and this password,
                  or just by continuing with Google.
                </p>

                <div className="mt-5 flex justify-center">
                  <div className={loading ? "pointer-events-none opacity-60" : ""}>
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => toast.error("Google sign-in failed")}
                    />
                  </div>
                </div>
                {loading && (
                  <p className="text-sm text-gray-500 text-center -mt-2 mb-4">Creating account...</p>
                )}
              </>
            ) : (
              <form onSubmit={handleGuestSignup} className="space-y-4">
                <Input
                  label="Full Name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  autoComplete="name"
                />
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
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <Button type="submit" className="w-full" isLoading={loading}>
                  Create Guest Account
                </Button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-150">
                Log in
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