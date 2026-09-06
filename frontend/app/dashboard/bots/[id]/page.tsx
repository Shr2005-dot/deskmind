"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  getBot,
  getDocuments,
  getBotAnalytics,
  type Bot,
  type Document,
  type AnalyticsData,
} from "@/lib/api";
import { BotHeader } from "@/components/bot/BotHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { OverviewTab } from "@/components/bot/OverviewTab";
import { KnowledgeTab } from "@/components/bot/KnowledgeTab";
import { ChatTab } from "@/components/bot/ChatTab";
import { EmbedTab } from "@/components/bot/EmbedTab";
import { SettingsTab } from "@/components/bot/SettingsTab";
import { AnalyticsTab } from "@/components/bot/AnalyticsTab";
import { LeadsTab } from "@/components/bot/LeadsTab";
import { ConversationsTab } from "@/components/bot/ConversationsTab";

type TabId = "overview" | "knowledge" | "chat" | "embed" | "analytics" | "leads" | "conversations" | "settings";

const tabs = [
  { id: "overview" as TabId, label: "Overview", icon: "📊" },
  { id: "knowledge" as TabId, label: "Knowledge", icon: "📚" },
  { id: "chat" as TabId, label: "Chat", icon: "💬" },
  { id: "analytics" as TabId, label: "Analytics", icon: "📈" },
  { id: "leads" as TabId, label: "Leads", icon: "👥" },
  { id: "conversations" as TabId, label: "Conversations", icon: "💭" },
  { id: "embed" as TabId, label: "Embed", icon: "🔗" },
  { id: "settings" as TabId, label: "Settings", icon: "⚙️" },
];

export default function BotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const botId = typeof params.id === "string" ? params.id : "";

  const [bot, setBot] = useState<Bot | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  const initialTab = (searchParams.get("tab") as TabId) || "overview";
  const [activeTab, setActiveTab] = useState<TabId>(tabs.some((t) => t.id === initialTab) ? initialTab : "overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [botData, docs] = await Promise.all([
        getBot(botId),
        getDocuments(botId),
      ]);
      setBot(botData);
      setDocuments(docs);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to load bot");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    if (!botId) return;
    if (typeof window !== "undefined" && !localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [botId, router, fetchData]);

  useEffect(() => {
    if (!botId) return;
    setLoadingAnalytics(true);
    let cancelled = false;
    const loadAnalytics = async () => {
      try {
        const data = await getBotAnalytics(botId);
        if (!cancelled) setAnalytics(data);
      } catch {
        // analytics is optional
      } finally {
        if (!cancelled) setLoadingAnalytics(false);
      }
    };
    loadAnalytics();
    return () => { cancelled = true; };
  }, [botId]);

  // Refresh documents when switching to knowledge tab (to pick up processing updates)
  useEffect(() => {
    if (activeTab === "knowledge" && botId) {
      getDocuments(botId).then((docs) => setDocuments(docs)).catch(() => {});
    }
  }, [activeTab, botId]);

  const handleBotUpdate = (updated: Bot) => {
    setBot(updated);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 text-primary-600 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-gray-500">Loading bot...</p>
        </div>
      </div>
    );
  }

  if (error || !bot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-4">{error || "Bot not found."}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/bots")}>
            Back to Bots
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <BotHeader
        bot={bot}
        onTestBot={() => setActiveTab("chat")}
        onDeploy={() => setActiveTab("embed")}
      />

      {/* Tabs */}
      <div className="bg-white border-b border-border">
        <div className="mx-auto max-w-6xl px-6">
          <Tabs
            items={tabs.map((t) => ({
              id: t.id,
              label: t.label,
            }))}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
          />
        </div>
      </div>

      {/* Tab panels */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        {activeTab === "overview" && (
          <OverviewTab
            bot={bot}
            documentsCount={documents.length}
            analytics={analytics}
            loadingAnalytics={loadingAnalytics}
          />
        )}
        {activeTab === "knowledge" && (
          <KnowledgeTab botId={botId} />
        )}
        {activeTab === "chat" && (
          <ChatTab botId={botId} botName={bot.name} />
        )}
        {activeTab === "embed" && (
          <EmbedTab botId={botId} botName={bot.name} avatar={bot.avatar} />
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab botId={botId} />
        )}
        {activeTab === "leads" && (
          <LeadsTab botId={botId} />
        )}
        {activeTab === "conversations" && (
          <ConversationsTab botId={botId} />
        )}
        {activeTab === "settings" && (
          <SettingsTab botId={botId} bot={bot} onSave={handleBotUpdate} />
        )}
      </div>
    </div>
  );
}
