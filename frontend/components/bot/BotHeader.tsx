"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { BotAvatar } from "@/components/branding/BotAvatar";

interface BotHeaderProps {
  bot: {
    id: string;
    name: string;
    avatar?: string | null;
    document_count?: number;
    created_at?: string;
  };
  onTestBot?: () => void;
  onDeploy?: () => void;
}

export function BotHeader({ bot, onTestBot, onDeploy }: BotHeaderProps) {
  return (
    <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-border">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/bots"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Bots
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-3">
            <BotAvatar avatar={bot.avatar} name={bot.name} className="h-8 w-8" />
            <h1 className="text-lg font-semibold text-gray-900">{bot.name}</h1>
            <Badge
              variant={(bot.document_count ?? 0) > 0 ? "success" : "default"}
            >
              {(bot.document_count ?? 0) > 0 ? "Active" : "No documents"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onTestBot}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Test Bot
          </Button>
          <Button size="sm" onClick={onDeploy}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Deploy
          </Button>
        </div>
      </div>
    </div>
  );
}
