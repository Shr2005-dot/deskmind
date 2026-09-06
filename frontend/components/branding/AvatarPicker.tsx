"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";

const AVATARS = Array.from({ length: 15 }, (_, i) => `/bot-avatars/avatar-${i + 1}.svg`);

interface AvatarPickerProps {
  value?: string | null;
  onChange: (avatar: string | undefined) => void;
  botId?: string;
}

export function AvatarPicker({ value, onChange, botId }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setPreview(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPreview(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selectedAvatar = value || null;
  const isCustom = selectedAvatar && selectedAvatar.startsWith("/uploads/avatars/");

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);

      if (!botId) {
        // For new bots without an id yet, use the data URL directly.
        // It will be stored as-is on the bot once created.
        onChange(dataUrl);
        setOpen(false);
        return;
      }

      setUploading(true);
      try {
        const updated = await import("@/lib/api").then((m) => m.uploadBotAvatar(botId, file));
        onChange(updated.avatar ?? undefined);
        setOpen(false);
      } catch (err) {
        const message =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (err instanceof Error ? err.message : "Failed to upload avatar");
        alert(message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearSelection = () => {
    onChange(undefined);
    setPreview(null);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 hover:border-gray-300 transition-colors duration-150"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedAvatar ? (
          <Image src={preview || selectedAvatar} alt="Selected avatar" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
            ?
          </div>
        )}
        <span className="text-sm text-gray-700">Choose avatar</span>
        <svg
          className={`ml-auto h-4 w-4 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {open && (
        <div className="absolute z-20 mt-2 w-72 rounded-xl border border-border bg-white shadow-lg">
          <div className="p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Select an avatar</p>
            <div className="grid grid-cols-5 gap-2">
              {AVATARS.map((src) => {
                const isSelected = selectedAvatar === src;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => {
                      onChange(isSelected ? undefined : src);
                      setOpen(false);
                    }}
                    className={`relative rounded-lg border-2 p-1 transition-all duration-150 hover:border-gray-300 ${
                      isSelected ? "border-primary-600 shadow-md" : "border-transparent"
                    }`}
                    aria-label={`Avatar ${src.split("-")[1]?.replace(".svg", "")}`}
                  >
                    <Image src={src} alt={`Avatar option`} width={40} height={40} className="h-9 w-9" />
                    {isSelected && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-white text-[10px]">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border p-3 space-y-2">
            {preview ? (
              <div className="flex items-center gap-3">
                <Image src={preview} alt="Preview" width={40} height={40} className="h-10 w-10 rounded-lg object-cover border border-border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">Custom upload</p>
                  <p className="text-[11px] text-gray-500">Ready to use</p>
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-error hover:text-error/80 font-medium transition-colors duration-150"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors duration-150 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload custom image"}
              </button>
            )}
          </div>
          {selectedAvatar && !preview && (
            <div className="border-t border-border px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Selected</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-error hover:text-error/80 font-medium transition-colors duration-150"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
