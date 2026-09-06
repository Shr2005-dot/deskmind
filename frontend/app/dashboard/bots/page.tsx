"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { getBots, deleteBot, type Bot } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BotAvatar } from "@/components/branding/BotAvatar";

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

export default function BotsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const router = useRouter();

  const fetchBots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBots();
      setBots(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to load bots");
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
    fetchBots();
  }, [router, fetchBots]);

  const handleDeleteClick = (e: React.MouseEvent, botId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteId(botId);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteBot(deleteId);
      setBots((prev) => prev.filter((b) => b.id !== deleteId));
      toast.success("Bot deleted");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to delete bot");
      toast.error(message);
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filteredBots = bots.filter((bot) =>
    bot.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            My Bots
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and configure your AI assistants.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard")} size="md">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Bot
        </Button>
      </div>

      {/* Search */}
      {bots.length > 0 && (
        <div className="mb-6">
          <Input
            placeholder="Search bots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton width="60%" height={20} className="mb-3" />
              <Skeleton width="40%" height={14} />
              <div className="mt-4 flex items-center justify-between">
                <Skeleton width={80} height={28} />
                <Skeleton variant="circular" width={32} height={32} />
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500 mb-4">Something went wrong.</p>
          <Button variant="outline" size="sm" onClick={fetchBots}>
            Try again
          </Button>
        </Card>
      ) : bots.length === 0 ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            title="No bots yet"
            description="Create your first AI assistant to start building intelligent document chatbots."
            actionLabel="Create your first bot"
            onAction={() => router.push("/dashboard")}
          />
        </Card>
      ) : filteredBots.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">
            No bots match &quot;{searchQuery}&quot;.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBots.map((bot) => (
            <Link key={bot.id} href={`/dashboard/bots/${bot.id}`}>
              <Card hoverable className="p-5 h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BotAvatar avatar={bot.avatar} name={bot.name} className="h-10 w-10" />
                    <h3 className="text-base font-semibold text-gray-900 truncate">
                      {bot.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteClick(e, bot.id)}
                    className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-error hover:bg-error-light transition-colors duration-150"
                    title="Delete bot"
                    aria-label={`Delete ${bot.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>{bot.document_count ?? 0} documents</span>
                  </div>
                  <Badge
                    variant={
                      (bot.document_count ?? 0) > 0 ? "success" : "default"
                    }
                  >
                    {(bot.document_count ?? 0) > 0 ? "Active" : "No documents"}
                  </Badge>
                </div>
                {bot.created_at && (
                  <p className="text-xs text-gray-400 mt-3">
                    Created {formatDate(bot.created_at)}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete bot"
        description="This will permanently delete this bot and all its data. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
