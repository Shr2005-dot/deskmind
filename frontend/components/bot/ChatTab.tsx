"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { sendChatMessage, createLead } from "@/lib/api";

interface ChatTabProps {
  botId: string;
  botName: string;
}

interface Source {
  document_filename: string;
  chunk_content: string;
  similarity_score: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  sources?: Source[];
  retrieval_details?: {
    query: string;
    query_rewritten: boolean;
    hybrid_enabled: boolean;
    vector_candidates: number;
    keyword_candidates: number;
    combined_candidates: number;
    final_chunks: number;
    relevance_scores: number[];
    duration_ms: number;
    refusal: boolean;
    refusal_reason: string;
  };
}

export function ChatTab({ botId, botName }: ChatTabProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string | number>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [submittedLeads, setSubmittedLeads] = useState<Set<number>>(new Set());
  const [openLeadForms, setOpenLeadForms] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || sending) return;

    const userMessage: Message = {
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setSending(true);
    setIsTyping(true);

    try {
      const response = await sendChatMessage(
        botId,
        userMessage.content,
        conversationId ?? undefined,
        showDebug,
      );
      if (!conversationId && response.conversation_id) {
        setConversationId(response.conversation_id);
      }
      const assistantMessage: Message = {
        role: "assistant",
        content: response.answer,
        timestamp: new Date().toISOString(),
        sources: response.sources?.map((s: Source) => ({
          document_filename: s.document_filename,
          chunk_content: s.chunk_content,
          similarity_score: s.similarity_score,
        })),
        retrieval_details: response.retrieval_details,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Chat failed");
      toast.error(message);
    } finally {
      setSending(false);
      setIsTyping(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setConversationId(null);
    setOpenLeadForms(new Set());
    setLeadEmail("");
    setSubmittedLeads(new Set());
  };

  const openLeadForm = (idx: number) => {
    setOpenLeadForms((prev) => new Set(prev).add(idx));
    setLeadEmail("");
  };

  const closeLeadForm = (idx: number) => {
    setOpenLeadForms((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
    setLeadEmail("");
  };

  const handleLeadSubmit = async (e: React.FormEvent, question: string, idx: number) => {
    e.preventDefault();
    if (!leadEmail.trim() || leadSubmitting) return;

    setLeadSubmitting(true);
    try {
      await createLead(botId, leadEmail.trim(), question);
      toast.success("Thanks! We'll follow up by email.");
      setSubmittedLeads((prev) => new Set(prev).add(idx));
      closeLeadForm(idx);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLeadSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ height: "600px" }}>
      {/* Messages */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-4"
      >
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              Hi! I'm {botName}, your AI assistant.
            </p>
            <p className="text-xs text-gray-500 max-w-xs">
              How can I help you today?
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className={`
                max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm
                ${msg.role === "user"
                  ? "bg-primary-600 text-white rounded-br-md"
                  : "bg-gray-100 text-gray-900 rounded-bl-md"
                }
              `}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              {msg.timestamp && (
                <p
                  className={`
                    text-xs mt-1.5 opacity-70
                    ${msg.role === "user" ? "text-primary-200" : "text-gray-400"}
                  `}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedSources((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) {
                          next.delete(idx);
                        } else {
                          next.add(idx);
                        }
                        return next;
                      });
                    }}
                    className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors duration-150 flex items-center gap-1"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${expandedSources.has(idx) ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Sources ({msg.sources.length})
                  </button>
                  {expandedSources.has(idx) && (
                    <div className="mt-2 space-y-2 animate-slide-in-right">
                      {msg.sources.map((source, sourceIdx) => (
                        <div
                          key={sourceIdx}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-medium text-gray-700 truncate">
                              {source.document_filename}
                            </p>
                            <Badge variant="info" className="shrink-0 !text-[10px]">
                              {Math.round(source.similarity_score * 100)}% match
                            </Badge>
                          </div>
                          <blockquote className="text-xs text-gray-600 italic line-clamp-3">
                            &ldquo;{source.chunk_content}&rdquo;
                          </blockquote>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {msg.role === "assistant" && msg.retrieval_details && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedSources((prev) => {
                        const next = new Set(prev);
                        const debugKey = `debug-${idx}`;
                        if (next.has(debugKey)) {
                          next.delete(debugKey);
                        } else {
                          next.add(debugKey);
                        }
                        return next;
                      });
                    }}
                    className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors duration-150 flex items-center gap-1"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${(expandedSources as Set<string | number>).has(`debug-${idx}`) ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Retrieval details
                  </button>
                  {(expandedSources as Set<string | number>).has(`debug-${idx}`) && (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 space-y-1 animate-slide-in-right">
                      <p><strong>Query:</strong> {msg.retrieval_details.query}</p>
                      <p><strong>Hybrid:</strong> {msg.retrieval_details.hybrid_enabled ? "Enabled" : "Disabled"}</p>
                      <p><strong>Vector results:</strong> {msg.retrieval_details.vector_candidates}</p>
                      <p><strong>Keyword results:</strong> {msg.retrieval_details.keyword_candidates}</p>
                      <p><strong>Combined:</strong> {msg.retrieval_details.combined_candidates}</p>
                      <p><strong>Final context:</strong> {msg.retrieval_details.final_chunks}</p>
                      {msg.retrieval_details.query_rewritten && <p><strong>Query rewritten:</strong> Yes</p>}
                      {msg.retrieval_details.refusal && <p className="text-red-600"><strong>Refused:</strong> {msg.retrieval_details.refusal_reason}</p>}
                    </div>
                  )}
                </div>
              )}
              {msg.role === "assistant" && (
                <div className="mt-3 flex items-center gap-3">
                  {!submittedLeads.has(idx) && !openLeadForms.has(idx) && (
                    <button
                      type="button"
                      onClick={() => openLeadForm(idx)}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      Get contacted
                    </button>
                  )}
                  {submittedLeads.has(idx) && (
                    <span className="text-xs text-green-700">We'll follow up by email.</span>
                  )}
                </div>
              )}
              {openLeadForms.has(idx) && !submittedLeads.has(idx) && (
                <form
                  onSubmit={(e) => handleLeadSubmit(e, messages[idx - 1]?.content || "", idx)}
                  className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 space-y-2"
                >
                  <p className="font-medium">Would you like us to contact you?</p>
                  <p className="text-yellow-700">Enter your email and we'll follow up.</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      onFocus={() => openLeadForm(idx)}
                      className="flex-1 rounded-md border border-yellow-300 px-2 py-1 text-xs outline-none focus:border-yellow-500"
                    />
                    <button
                      type="submit"
                      disabled={leadSubmitting}
                      className="rounded-md bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
                    >
                      {leadSubmitting ? "Sending..." : "Send"}
                    </button>
                    <button
                      type="button"
                      onClick={() => closeLeadForm(idx)}
                      className="rounded-md border border-yellow-300 px-3 py-1 text-xs text-yellow-800 hover:bg-yellow-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.1s" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex gap-3 border-t border-border p-4 bg-white"
      >
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClear}
            className="shrink-0"
            title="Clear conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        )}
        <Button
          type="button"
          variant={showDebug ? "primary" : "ghost"}
          size="md"
          onClick={() => setShowDebug(!showDebug)}
          className="shrink-0"
          title="Toggle retrieval debug info"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </Button>
        <Input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1"
          disabled={sending}
        />
        <Button
          type="submit"
          disabled={sending || !chatInput.trim()}
          size="md"
        >
          {sending ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </Button>
      </form>
    </div>
  );
}
