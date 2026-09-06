"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AuthPageGuardProps {
  children: React.ReactNode;
}

/**
 * Guard shared by the public auth pages (/login, /signup).
 *
 * 1. Neutralizes the browser back/forward buttons while on an auth page by
 *    pushing a history sentinel on mount and re-pushing on every popstate.
 * 2. Keeps auth state in sync across tabs via a storage listener.
 * 3. No longer redirects authenticated users away from auth pages, so users
 *    can always reach the login/signup forms.
 */
export function AuthPageGuard({ children }: AuthPageGuardProps) {
  const router = useRouter();

  useEffect(() => {
    const lockHistory = () => {
      window.history.pushState(null, "", window.location.href);
    };
    lockHistory();
    window.addEventListener("popstate", lockHistory);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "token" && e.newValue) {
        router.replace("/dashboard");
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("popstate", lockHistory);
      window.removeEventListener("storage", handleStorage);
    };
  }, [router]);

  return <>{children}</>;
}
