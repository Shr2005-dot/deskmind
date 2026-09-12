"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { AppLogo } from "@/components/branding/AppLogo";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const pathname = usePathname();
  const isBotDetail = /^\/dashboard\/bots\/[^\/]+$/.test(pathname);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    setSidebarOpen(window.innerWidth >= 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      {sidebarOpen && isDesktop && (
        <aside className="fixed inset-y-0 left-0 z-40 w-56 bg-white border-r border-border flex-col">
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </aside>
      )}

      {/* Mobile sidebar overlay */}
      {sidebarOpen && !isDesktop && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-56 bg-white border-r border-border shadow-xl animate-slide-in-right">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className={isDesktop && sidebarOpen ? "md:pl-56" : "md:pl-0"}>
        {/* Top header bar */}
        {!isBotDetail && (
          <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-border">
            <div className="flex items-center h-16 md:h-20 px-4">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center p-2 -ml-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors duration-150"
                  aria-label="Open menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              <div className={sidebarOpen ? "ml-2" : ""}>
                 <AppLogo className="h-5 w-auto md:h-6" />
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
