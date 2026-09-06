"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import toast from "react-hot-toast";
import {
  getDocuments,
  uploadDocument,
  addUrlDocument,
  deleteDocument,
  deleteAllDocuments,
  refreshDocument,
  getDocument,
} from "@/lib/api";

interface KnowledgeTabProps {
  botId: string;
}

interface Document {
  id: string;
  filename: string;
  status: string;
  source_type: string;
  uploaded_at: string | null;
  source_url: string | null;
  title: string | null;
  fetched_at: string | null;
  chunk_count: number;
}

type FilterType = "all" | "files" | "websites";

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

function getSourceIcon(sourceType: string) {
  if (sourceType === "url") {
    return (
      <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    );
  }
  if (sourceType === "markdown" || sourceType === "md") {
    return (
      <svg className="w-5 h-5 text-purple-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (sourceType === "txt" || sourceType === "text") {
    return (
      <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  // PDF default
  return (
    <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function getSourceTypeLabel(sourceType: string): string {
  const map: Record<string, string> = {
    pdf: "PDF",
    txt: "TXT",
    text: "TXT",
    markdown: "Markdown",
    md: "Markdown",
    url: "Website",
  };
  return map[sourceType] || sourceType;
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "error" | "warning" | "default"> = {
    ready: "success",
    failed: "error",
    processing: "warning",
  };
  const labelMap: Record<string, string> = {
    ready: "Ready",
    failed: "Failed",
    processing: "Processing",
  };
  return (
    <Badge variant={variantMap[status] || "default"}>
      {labelMap[status] || status}
    </Badge>
  );
}

export function KnowledgeTab({ botId }: KnowledgeTabProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailDoc, setDetailDoc] = useState<Document | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments(botId);
      setDocuments(docs as Document[]);
    } catch {
      // silent refresh
    }
  }, [botId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const docs = await getDocuments(botId);
        if (!cancelled) {
          setDocuments(docs as Document[]);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail ||
            (err instanceof Error ? err.message : "Failed to load documents");
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [botId]);

  useEffect(() => {
    const hasProcessing = documents.some((doc) => doc.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(refreshDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents, refreshDocuments]);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fileInput = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      toast.error("Please select a file");
      return;
    }
    setUploading(true);
    try {
      const doc = await uploadDocument(botId, file);
      setDocuments((prev) => [...prev, doc as Document]);
      toast.success("Document uploaded");
      fileInput.value = "";
      setFileInputKey((k) => k + 1);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Upload failed");
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setAddingUrl(true);
    try {
      const doc = await addUrlDocument(botId, urlInput.trim());
      setDocuments((prev) => [...prev, doc as Document]);
      setUrlInput("");
      toast.success("Page imported");
      setShowAddModal(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to add URL");
      toast.error(message);
    } finally {
      setAddingUrl(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    try {
      await deleteDocument(botId, confirmDeleteId);
      setDocuments((prev) => prev.filter((d) => d.id !== confirmDeleteId));
      if (detailDoc?.id === confirmDeleteId) {
        setDetailDoc(null);
      }
      toast.success("Source removed");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to delete source");
      toast.error(message);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const confirmClearAll = async () => {
    setShowClearAll(false);
    setClearingAll(true);
    try {
      const result = await deleteAllDocuments(botId);
      const deletedCount = (result as { deleted?: number }).deleted ?? documents.length;
      setDocuments([]);
      setDetailDoc(null);
      toast.success(`${deletedCount} source${deletedCount === 1 ? "" : "s"} removed`);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to clear sources");
      toast.error(message);
    } finally {
      setClearingAll(false);
    }
  };

  const handleRefresh = async (doc: Document) => {
    setRefreshingId(doc.id);
    try {
      const updated = await refreshDocument(botId, doc.id);
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? (updated as Document) : d))
      );
      if (detailDoc?.id === doc.id) {
        setDetailDoc(updated as Document);
      }
      toast.success("Page refreshed");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to refresh");
      toast.error(message);
    } finally {
      setRefreshingId(null);
    }
  };

  const openDetail = async (doc: Document) => {
    setDetailDoc(doc);
    try {
      const full = await getDocument(botId, doc.id);
      setDetailDoc(full as Document);
    } catch {
      // keep existing data
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    if (filter === "files") return doc.source_type !== "url";
    if (filter === "websites") return doc.source_type === "url";
    return true;
  });

  const fileCount = documents.filter((d) => d.source_type !== "url").length;
  const websiteCount = documents.filter((d) => d.source_type === "url").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <Skeleton width={160} height={24} className="mb-4" />
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8">
            <Skeleton width={200} height={40} className="mx-auto mb-3" />
            <Skeleton width={160} height={16} className="mx-auto mb-4" />
            <div className="flex justify-center">
              <Skeleton width={80} height={32} />
            </div>
          </div>
        </Card>
        <Card className="p-6 overflow-hidden">
          <Skeleton width={120} height={24} className="mb-4" />
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton width={180} height={16} />
                  <Skeleton width={60} height={20} />
                </div>
                <Skeleton width={60} height={20} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + Add button */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Knowledge Base</h3>
            <p className="text-sm text-gray-500 mt-1">
              Teach your AI everything it needs to know.
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)} size="sm">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add knowledge
          </Button>
        </div>
      </Card>

      {/* Source list */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Sources</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {documents.length} source{documents.length === 1 ? "" : "s"} total
            </p>
          </div>
          {documents.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === "all"
                      ? "bg-primary-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("files")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                    filter === "files"
                      ? "bg-primary-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Files ({fileCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("websites")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                    filter === "websites"
                      ? "bg-primary-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Websites ({websiteCount})
                </button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearAll(true)}
                disabled={clearingAll}
                className="text-error hover:text-error hover:bg-error-light"
              >
                Clear All
              </Button>
            </div>
          )}
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg
              className="w-12 h-12 mx-auto text-gray-300 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm text-gray-500">
              {documents.length === 0
                ? "Your AI doesn't know anything yet."
                : "No sources match this filter."}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {documents.length === 0
                ? "Add documents or website pages to give your assistant knowledge."
                : "Try a different filter or add a new source."}
            </p>
            {documents.length === 0 && (
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => setShowAddModal(true)}>
                  Upload files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddModal(true);
                  }}
                >
                  Add website
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="px-6 py-3 font-medium text-gray-500">Source</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Type</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Chunks</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Added</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDocuments.map((doc) => {
                  const isDeleting = deletingId === doc.id;
                  const isConfirming = confirmDeleteId === doc.id;
                  const isRefreshing = refreshingId === doc.id;
                  const isProcessing = doc.status === "processing";
                  const displayName = doc.title || doc.filename;
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-gray-50/50 transition-colors duration-150 cursor-pointer"
                      onClick={() => openDetail(doc)}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          {getSourceIcon(doc.source_type)}
                          <div className="min-w-0">
                            <span className="text-gray-900 font-medium truncate block max-w-[220px]">
                              {displayName}
                            </span>
                            {doc.source_type === "url" && doc.source_url && (
                              <span className="text-xs text-gray-400 truncate block max-w-[220px]">
                                {doc.source_url}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        <span className="capitalize">{getSourceTypeLabel(doc.source_type)}</span>
                      </td>
                      <td className="px-6 py-3">
                        {isProcessing ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Processing
                          </span>
                        ) : (
                          <StatusBadge status={doc.status} />
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-500 text-right tabular-nums">
                        {doc.chunk_count}
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {formatDate(doc.uploaded_at)}
                      </td>
                      <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {isConfirming ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => confirmDelete()}
                              disabled={isDeleting}
                              className="!px-2.5 !py-1 !text-xs"
                            >
                              {isDeleting ? "..." : "Confirm"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isDeleting}
                              className="!px-2.5 !py-1 !text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-0.5">
                            {doc.source_type === "url" && doc.status === "ready" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRefresh(doc)}
                                disabled={isRefreshing}
                                className="!p-1.5 text-gray-400 hover:text-primary-600"
                                title="Refresh page"
                              >
                                <svg className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(doc.id)}
                              className="!p-1.5 text-gray-400 hover:text-error"
                              title="Delete source"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Knowledge Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add knowledge"
        description="Import documents or web pages to give your bot context."
        size="md"
      >
        <div className="space-y-6">
          {/* File upload */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Upload file</h4>
            <p className="text-xs text-gray-500 mb-3">
              Supported formats: PDF, TXT, Markdown (max 10 MB)
            </p>
            <form onSubmit={handleUpload}>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center transition-all duration-150 ease-out hover:border-primary-400 hover:bg-primary-50/50">
                <svg
                  className="w-8 h-8 mx-auto text-gray-400 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm text-gray-600 mb-1">
                  Drop files here or click to browse
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  PDF, TXT, or Markdown
                </p>
                <input
                  key={fileInputKey}
                  name="file"
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="text-sm"
                />
                <div className="mt-3">
                  <Button type="submit" isLoading={uploading} size="sm">
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            </form>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-gray-500">or</span>
            </div>
          </div>

          {/* URL import */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Add website</h4>
            <p className="text-xs text-gray-500 mb-3">
              Enter a public webpage URL and DeskMind will use its content as knowledge.
            </p>
            <form onSubmit={handleUrlSubmit} className="flex gap-2">
              <Input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/faq"
                required
                className="flex-1"
              />
              <Button type="submit" isLoading={addingUrl} size="md">
                {addingUrl ? "Importing..." : "Import page"}
              </Button>
            </form>
          </div>
        </div>
      </Modal>

      {/* Source Detail Modal */}
      {detailDoc && (
        <Modal
          isOpen={!!detailDoc}
          onClose={() => setDetailDoc(null)}
          title={detailDoc.title || detailDoc.filename}
          description={
            detailDoc.source_type === "url" && detailDoc.source_url
              ? detailDoc.source_url
              : undefined
          }
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Type</p>
                <p className="text-sm text-gray-900 capitalize">{getSourceTypeLabel(detailDoc.source_type)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <StatusBadge status={detailDoc.status} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Chunks</p>
                <p className="text-sm text-gray-900 tabular-nums">{detailDoc.chunk_count}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Added</p>
                <p className="text-sm text-gray-900">{formatDate(detailDoc.uploaded_at)}</p>
              </div>
              {detailDoc.source_type === "url" && detailDoc.fetched_at && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Last fetched</p>
                  <p className="text-sm text-gray-900">{formatDate(detailDoc.fetched_at)}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              {detailDoc.source_type === "url" && detailDoc.status === "ready" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRefresh(detailDoc)}
                  isLoading={refreshingId === detailDoc.id}
                >
                  Refresh
                </Button>
              )}
              {detailDoc.source_type === "url" && detailDoc.source_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(detailDoc.source_url!, "_blank")}
                >
                  Open URL
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDetailDoc(null);
                  setConfirmDeleteId(detailDoc.id);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showClearAll}
        onClose={() => setShowClearAll(false)}
        onConfirm={confirmClearAll}
        title="Clear all sources"
        description={`This will delete all ${documents.length} source${documents.length === 1 ? "" : "s"} for this bot and cannot be undone.`}
        confirmLabel="Clear All"
        variant="danger"
        isLoading={clearingAll}
      />
    </div>
  );
}
