"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import toast from "react-hot-toast";
import { updateBot, deleteBot, type Bot } from "@/lib/api";
import { BotAvatar } from "@/components/branding/BotAvatar";
import { AvatarPicker } from "@/components/branding/AvatarPicker";

interface SettingsTabProps {
  botId: string;
  bot: Bot | null;
  onSave: (updated: Bot) => void;
}

export function SettingsTab({ botId, bot, onSave }: SettingsTabProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [widgetName, setWidgetName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [welcome, setWelcome] = useState("");
  const [questions, setQuestions] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!bot) return;
    setName(bot.name);
    setAvatar(bot.avatar ?? undefined);
    setWidgetName(bot.widget_name || "");
    setColor(bot.widget_color || "#6366f1");
    setWelcome(bot.welcome_message || "");
    setQuestions(
      bot.suggested_questions && bot.suggested_questions.length > 0
        ? bot.suggested_questions.join("\n")
        : ""
    );
    setSaved(false);
  }, [bot?.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateBot(botId, {
        name: name.trim() || bot?.name || "",
        avatar: avatar,
        widget_color: color,
        widget_name: widgetName.trim() || undefined,
        welcome_message: welcome.trim() || undefined,
        suggested_questions: questions
          .split("\n")
          .map((q) => q.trim())
          .filter(Boolean),
      });
      onSave(updated);
      setSaved(true);
      toast.success("Settings saved");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to save settings");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteBot(botId);
      toast.success("Bot deleted");
      router.push("/dashboard/bots");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to delete bot");
      toast.error(message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (!bot) {
    return (
      <Card className="p-6">
        <Skeleton width="40%" height={24} className="mb-2" />
        <Skeleton width="60%" height={16} className="mb-6" />
        <div className="space-y-5">
          <Skeleton width="100%" height={40} />
          <Skeleton width="100%" height={40} />
          <Skeleton width="100%" height={80} />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* General */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">General</h3>
        <p className="text-sm text-gray-500 mb-5">
          Basic information about your bot.
        </p>
        <div className="max-w-md space-y-5">
          <Input
            label="Bot Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Bot"
            required
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Avatar
            </label>
            <AvatarPicker value={avatar} onChange={setAvatar} botId={botId} />
          </div>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Appearance</h3>
        <p className="text-sm text-gray-500 mb-5">
          Customize how the widget looks on your website.
        </p>
        <div className="max-w-md space-y-5">
          <Input
            label="Widget Display Name"
            value={widgetName}
            onChange={(e) => setWidgetName(e.target.value)}
            placeholder={bot.name}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Widget Primary Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-10 rounded-lg border border-border cursor-pointer bg-white p-1"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#6366f1"
                className="flex-1 font-mono"
              />
            </div>
          </div>
          <Textarea
            label="Welcome Message"
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            placeholder="Hi! How can I help you today?"
            rows={3}
          />
        </div>
      </Card>

      {/* Suggested questions */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Suggested Questions</h3>
        <p className="text-sm text-gray-500 mb-5">
          One question per line. These will appear as clickable chips in the widget.
        </p>
        <div className="max-w-md">
          <Textarea
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="What are your hours?\nHow do I get started?\nWhat pricing plans are available?"
            rows={4}
          />
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="p-6 border-error/30">
        <h3 className="text-base font-semibold text-error mb-1">Danger Zone</h3>
        <p className="text-sm text-gray-500 mb-5">
          Irreversible actions that affect this bot.
        </p>
        <div className="flex items-center justify-between p-4 rounded-lg border border-error-light bg-error-light/30">
          <div>
            <p className="text-sm font-medium text-gray-900">Delete this bot</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Permanently remove this bot and all its data.
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            Delete Bot
          </Button>
        </div>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} isLoading={saving} size="md">
          Save Changes
        </Button>
        {saved && (
          <span className="text-sm text-success font-medium animate-fade-in">
            Saved
          </span>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this bot?"
        description={`This will permanently delete "${bot.name}" and all its documents, conversations, leads, and analytics. This action cannot be undone.`}
        confirmLabel="Delete Bot"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
