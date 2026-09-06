"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { getBotLeads, updateLeadStatus, deleteLead, exportLeadsCsv, type Lead } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

interface LeadsTabProps {
  botId: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
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

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
];

export function LeadsTab({ botId }: LeadsTabProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBotLeads(botId);
      setLeads(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to load leads");
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

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    setSavingId(leadId);
    try {
      const updated = await updateLeadStatus(botId, leadId, newStatus);
      setLeads((prev) => prev.map((lead) => (lead.id === leadId ? updated : lead)));
      toast.success("Lead updated");
    } catch {
      toast.error("Failed to update lead");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (leadId: string) => {
    setSavingId(leadId);
    try {
      await deleteLead(botId, leadId);
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      toast.success("Lead deleted");
    } catch {
      toast.error("Failed to delete lead");
    } finally {
      setSavingId(null);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportLeadsCsv(botId);
      const url = window.URL.createObjectURL(new Blob([blob], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `leads-${botId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export leads");
    }
  };

  const filtered = leads.filter((lead) => {
    const matchesSearch = !search || lead.email.toLowerCase().includes(search.toLowerCase()) || lead.question.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !status || lead.status === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="animate-fade-in">
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Captured Leads</h3>
              <p className="text-sm text-gray-500 mt-1">
                Visitors who showed interest and left their email for follow-up.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search leads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={handleExport}>
                Export CSV
              </Button>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
                <div className="flex-1 min-w-0">
                  <Skeleton width={180} height={16} className="mb-2" />
                  <Skeleton width="100%" height={14} />
                </div>
                <Skeleton width={120} height={14} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm text-gray-500">No leads captured yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Question</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Date</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors duration-150">
                    <td className="px-6 py-4">
                      <span className="text-gray-900 font-medium">{lead.email}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs">
                      <span className="line-clamp-2">&ldquo;{lead.question}&rdquo;</span>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        disabled={savingId === lead.id}
                        className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="converted">Converted</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(lead.id)}
                        disabled={savingId === lead.id}
                        className="text-error hover:text-error"
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
