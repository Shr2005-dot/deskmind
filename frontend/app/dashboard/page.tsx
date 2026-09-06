"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { getBots, getDashboardOverview, createBot, type Bot } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { BotAvatar } from "@/components/branding/BotAvatar";
import { AvatarPicker } from "@/components/branding/AvatarPicker";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function DashboardPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [overview, setOverview] = useState<{
    stats: { total_bots: number; total_documents: number; total_conversations: number; total_messages: number; total_leads: number };
    recent_bots: { id: string; name: string; document_count: number; created_at: string }[];
    recent_leads: { id: string; email: string; question: string; status: string; created_at: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | undefined>(undefined);
  const [limitReached, setLimitReached] = useState(false);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLimitReached(false);
    try {
      const [botsData, overviewData] = await Promise.all([
        getBots(),
        getDashboardOverview().catch(() => null),
      ]);
      setBots(botsData);
      setOverview(overviewData);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to load dashboard");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [router, fetchData]);

  // Show limit banner when guest user has 2 bots
  const user = useAuthStore.getState().user;
  const isGuest = user && !user.google_id;
  const guestLimitBanner = isGuest && bots.length >= 2 && !limitReached;

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBotName.trim()) return;

    setCreating(true);
    try {
      const bot = await createBot(newBotName.trim(), selectedAvatar);
      setBots((prev) => [...prev, bot]);
      setNewBotName("");
      setSelectedAvatar(undefined);
      setLimitReached(false);
      toast.success("Bot created");
      router.push(`/dashboard/bots/${bot.id}`);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to create bot");
      if (message.includes("limited to 2 bots") || message.includes("Continue with Google")) {
        setLimitReached(true);
      }
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const totalDocuments = bots.reduce((sum, bot) => sum + (bot.document_count ?? 0), 0);
  const stats = overview?.stats;
  const recentBots = overview?.recent_bots ?? [];
  const recentLeads = overview?.recent_leads ?? [];

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Monitor your AI assistants and customer conversations.</p>
      </div>

      {/* Create bot */}
      {(guestLimitBanner || limitReached) && (
        <Card className="p-4 mb-6 border-warning bg-warning-light">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-warning mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.774-.833-1.732-.833-2.5 0L4.268 19.5c-.774.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">Guest accounts are limited to 2 bots.</p>
              <p className="text-sm text-gray-600 mt-1">
                Continue with Google to create more bots.
              </p>
            </div>
          </div>
        </Card>
      )}
      <form onSubmit={handleCreateBot} className="mb-8">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Create New Bot</h2>
          <p className="text-sm text-gray-500 mb-4">Give your AI assistant a name and choose an avatar to get started.</p>
          <div className="flex flex-col gap-4">
            <Input
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="My AI Assistant"
              className="max-w-md"
              required
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Avatar</label>
              <AvatarPicker value={selectedAvatar} onChange={setSelectedAvatar} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" isLoading={creating} size="md" className="shrink-0">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Bot
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total Bots", value: stats?.total_bots ?? bots.length },
          { label: "Documents", value: stats?.total_documents ?? totalDocuments },
          { label: "Conversations", value: stats?.total_conversations ?? 0 },
          { label: "Messages", value: stats?.total_messages ?? 0 },
          { label: "Leads", value: stats?.total_leads ?? 0 },
        ].map((item) => (
          <Card key={item.label} className="p-5">
            <p className="text-sm font-medium text-gray-500 mb-1">{item.label}</p>
            {loading ? (
              <Skeleton width={80} height={32} />
            ) : (
              <p className="text-2xl font-bold text-gray-900">{item.value.toLocaleString()}</p>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent bots */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Bots</h2>
            {bots.length > 0 && (
              <Link href="/dashboard/bots" className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors duration-150">
                View all
              </Link>
            )}
          </div>

          {loading ? (
            <Card className="p-0 overflow-hidden">
              <div className="divide-y divide-border">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-5 py-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <Skeleton width="60%" height={20} />
                      <Skeleton width="40%" height={14} className="mt-2" />
                    </div>
                    <Skeleton variant="circular" width={32} height={32} />
                  </div>
                ))}
              </div>
            </Card>
          ) : error ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-gray-500 mb-4">Something went wrong.</p>
              <Button variant="outline" size="sm" onClick={fetchData}>Try again</Button>
            </Card>
          ) : bots.length === 0 ? (
            <Card className="p-0 overflow-hidden">
              <EmptyState
                title="No bots yet"
                description="Create your first AI assistant to start building intelligent document chatbots."
                actionLabel="Create bot"
                onAction={() => {
                  const input = document.querySelector('input[type="text"]') as HTMLInputElement | null;
                  input?.focus();
                }}
              />
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="divide-y divide-border">
                  {(recentBots.length > 0 ? recentBots : bots.slice(0, 5)).map((bot) => (
                    <Link
                      key={bot.id}
                      href={`/dashboard/bots/${bot.id}`}
                      className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors duration-150"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <BotAvatar avatar={(bot as Bot).avatar ?? undefined} name={bot.name} className="h-10 w-10" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{bot.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {bot.document_count ?? 0} documents
                            {bot.created_at && <span className="text-gray-300 mx-1.5">·</span>}
                            {formatDate(bot.created_at)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={(bot.document_count ?? 0) > 0 ? "success" : "default"}>
                        {(bot.document_count ?? 0) > 0 ? "Active" : "No documents"}
                      </Badge>
                    </Link>
                  ))}
              </div>
            </Card>
          )}
        </div>

        {/* Quick actions + recent leads */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <Card className="p-5 space-y-3">
              <Link href="/dashboard/bots" className="block">
                <Button variant="outline" className="w-full justify-start" size="md">
                  <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create bot
                </Button>
              </Link>
              {bots.length > 0 && (
                <Link href={`/dashboard/bots/${bots[0].id}`} className="block">
                  <Button variant="outline" className="w-full justify-start" size="md">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Add knowledge
                  </Button>
                </Link>
              )}
              {bots.length > 0 && (
                <Link href={`/dashboard/bots/${bots[0].id}?tab=chat`} className="block">
                  <Button variant="outline" className="w-full justify-start" size="md">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Test a bot
                  </Button>
                </Link>
              )}
            </Card>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Recent Leads</h2>
              {bots.length > 0 && (
                <Link href={`/dashboard/bots/${bots[0].id}?tab=leads`} className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors duration-150">
                  View all
                </Link>
              )}
            </div>
            <Card className="p-0 overflow-hidden">
              {recentLeads.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-gray-500">No leads yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentLeads.map((lead) => (
                    <div key={lead.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900 truncate">{lead.email}</p>
                      <p className="text-xs text-gray-500 truncate">&ldquo;{lead.question}&rdquo;</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(lead.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
