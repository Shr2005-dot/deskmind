"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface OverviewTabProps {
  bot: {
    id: string;
    name: string;
    document_count?: number;
    created_at?: string;
  };
  documentsCount: number;
  analytics: {
    total_conversations: number;
    total_messages: number;
  } | null;
  loadingAnalytics: boolean;
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | string;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      {loading ? (
        <Skeleton width={60} height={32} />
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      )}
    </Card>
  );
}

export function OverviewTab({
  bot,
  documentsCount,
  analytics,
  loadingAnalytics,
}: OverviewTabProps) {
  const createdDate = bot.created_at
    ? new Date(bot.created_at).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Documents" value={documentsCount} />
        <StatCard
          label="Conversations"
          value={analytics ? analytics.total_conversations : "—"}
          loading={loadingAnalytics}
        />
        <StatCard
          label="Messages"
          value={analytics ? analytics.total_messages : "—"}
          loading={loadingAnalytics}
        />
        <Card className="p-5">
          <p className="text-sm font-medium text-gray-500 mb-1">Status</p>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
            </span>
            <p className="text-sm font-medium text-gray-900">Active</p>
          </div>
        </Card>
      </div>

      {/* Details */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Bot Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Bot ID</p>
            <p className="text-sm text-gray-900 font-mono">{bot.id}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Created</p>
            <p className="text-sm text-gray-900">{createdDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Documents</p>
            <p className="text-sm text-gray-900">{documentsCount} uploaded</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Widget Name</p>
            <p className="text-sm text-gray-900">{bot.name}</p>
          </div>
        </div>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href={`/dashboard/bots/${bot.id}?tab=knowledge`}>
          <Card hoverable className="p-5 h-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Knowledge</p>
                <p className="text-xs text-gray-500">Manage documents</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href={`/dashboard/bots/${bot.id}?tab=chat`}>
          <Card hoverable className="p-5 h-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Test Chat</p>
                <p className="text-xs text-gray-500">Try the assistant</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href={`/dashboard/bots/${bot.id}?tab=embed`}>
          <Card hoverable className="p-5 h-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Deploy</p>
                <p className="text-xs text-gray-500">Get embed code</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
