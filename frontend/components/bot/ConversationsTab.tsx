"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { getBotConversations, getBotConversation, type ConversationListItem } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface ConversationsTabProps {
  botId: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ConversationsTab({ botId }: ConversationsTabProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string; created_at: string }[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBotConversations(botId);
      setConversations(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to load conversations");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    let cancelled = false;
    load();
    return () => { cancelled = true; };
  }, [load]);

  const openConversation = async (conversationId: string) => {
    setSelectedId(conversationId);
    setLoadingMessages(true);
    setMessages([]);
    try {
      const data = await getBotConversation(botId, conversationId);
      setMessages(
        data.messages.map((m) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
      );
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setLoadingMessages(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-0 overflow-hidden lg:col-span-1">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-base font-semibold text-gray-900">Conversations</h3>
            <p className="text-sm text-gray-500 mt-1">{conversations.length} total</p>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton width="70%" height={16} />
                  <Skeleton width="40%" height={14} className="mt-2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-500 mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={load}>Try again</Button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-500">No conversations yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => openConversation(conversation.id)}
                  className={`w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors duration-150 ${
                    selectedId === conversation.id ? "bg-gray-50" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {conversation.preview || "Conversation"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {conversation.message_count} messages
                    {conversation.last_message_at && (
                      <>
                        <span className="text-gray-300 mx-1.5">·</span>
                        {formatDate(conversation.last_message_at)}
                      </>
                    )}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-0 overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-base font-semibold text-gray-900">Messages</h3>
          </div>
          {!selectedId ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-gray-500">Select a conversation to view messages.</p>
            </div>
          ) : loadingMessages ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="90%" height={14} className="mt-2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map((message) => (
                <div key={`${message.created_at}-${message.role}`} className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {message.role}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(message.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{message.content}</p>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">No messages in this conversation.</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
