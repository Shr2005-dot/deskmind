"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  getBotAnalytics,
  type AnalyticsData,
} from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AnalyticsTabProps {
  botId: string;
}

interface StatCardProps {
  label: string;
  value: number;
  loading?: boolean;
}

function StatCard({ label, value, loading }: StatCardProps) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      {loading ? (
        <Skeleton width={80} height={32} />
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      )}
    </Card>
  );
}

export function AnalyticsTab({ botId }: AnalyticsTabProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const analytics = await getBotAnalytics(botId);
      setData(analytics);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to load analytics");
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Total Conversations" value={0} loading />
          <StatCard label="Total Messages" value={0} loading />
        </div>
        <Card className="p-6">
          <Skeleton width={160} height={24} className="mb-4" />
          <Skeleton width="100%" height={260} />
        </Card>
        <Card className="p-6">
          <Skeleton width={160} height={24} className="mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={16} />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-500 mb-4">{error || "No analytics available yet."}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  const hasActivity = data.total_messages > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Conversations" value={data.total_conversations} />
        <StatCard label="Total Messages" value={data.total_messages} />
      </div>

      {/* Messages per day chart */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-gray-900">Messages per Day</h3>
          <p className="text-sm text-gray-500 mt-1">Last 14 days</p>
        </div>
        <div className="p-6">
          {!hasActivity ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="w-10 h-10 text-gray-300 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <p className="text-sm text-gray-500">No messages yet.</p>
              <p className="text-xs text-gray-400 mt-1">Start a conversation to see activity here.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={data.messages_per_day}
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                  tickFormatter={(value: string) => value.slice(5)}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                />
                <Tooltip
                  labelFormatter={(label) => `Date: ${label}`}
                  formatter={(value) => [value, "Messages"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1" }}
                  activeDot={{ r: 5, fill: "#6366f1" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Top questions */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-gray-900">Top Questions Asked</h3>
          <p className="text-sm text-gray-500 mt-1">Most frequent user questions</p>
        </div>
        {data.top_questions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No user questions recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.top_questions.map((item, index) => (
              <div
                key={`${item.question}-${index}`}
                className="flex items-center justify-between gap-4 px-6 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 shrink-0 text-sm font-semibold text-gray-400">
                    {index + 1}
                  </span>
                  <span className="text-sm text-gray-800 truncate">{item.question}</span>
                </div>
                <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                  {item.count} {item.count === 1 ? "ask" : "asks"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
