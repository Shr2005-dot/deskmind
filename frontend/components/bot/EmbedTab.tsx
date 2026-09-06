"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Image from "next/image";
import toast from "react-hot-toast";

interface EmbedTabProps {
  botId: string;
  botName: string;
  avatar?: string | null;
}

export function EmbedTab({ botId, botName, avatar }: EmbedTabProps) {
  const [copied, setCopied] = useState(false);

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const embedCode = `<script src="${apiBaseUrl}/widget.js" data-bot-id="${botId}"></script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      toast.success("Embed code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Deployment info */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Deploy your assistant</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-2xl">
          Add this snippet before the closing <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">&lt;/body&gt;</code> tag on any page where you want the {botName} widget to appear.
        </p>

        <div className="flex items-center justify-between gap-3 mb-4">
          <h4 className="text-sm font-medium text-gray-700">Embed Code</h4>
          <Button
            variant={copied ? "secondary" : "outline"}
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy code
              </>
            )}
          </Button>
        </div>

        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100 font-mono leading-relaxed">
            {embedCode}
          </pre>
        </div>
      </Card>

      {/* Live preview */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Live Preview</h3>
            <p className="text-xs text-gray-500 mt-0.5">How the widget will look on your site</p>
          </div>
          <Badge variant="success">Ready</Badge>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <div className="flex-1 mx-2">
                <div className="bg-white rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-400 max-w-xs">
                  https://your-website.com
                </div>
              </div>
            </div>
          </div>
          <div className="p-8 bg-gray-50 min-h-[200px] flex items-center justify-center">
            <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                {avatar ? (
                  <Image src={avatar} alt={botName} width={32} height={32} className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white text-xs font-bold">
                    {botName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{botName}</p>
                  <p className="text-xs text-gray-500">Online</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600 max-w-[80%]">
                  Hi! How can I help you today?
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <div className="flex-1 bg-gray-100 rounded-md px-3 py-1.5 text-xs text-gray-400">
                  Type a message...
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Instructions */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">How it works</h3>
        <ol className="space-y-3">
          {[
            "Copy the embed code above.",
            "Paste it into your website's HTML, just before the closing </body> tag.",
            "The widget will automatically load and appear in the bottom-right corner of your page.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                {i + 1}
              </span>
              <span className="text-gray-600 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
