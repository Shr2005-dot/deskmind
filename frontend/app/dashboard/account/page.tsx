"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { getAccountProfile, deleteAccount } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function AccountSettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState<string | undefined>(undefined);
  const [pictureUrl, setPictureUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await getAccountProfile();
      setEmail(profile.email);
      setName(profile.name);
      setPictureUrl(profile.picture_url);
    } catch {
      toast.error("Failed to load account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router, load]);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      toast.success("Account deleted");
      router.push("/");
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Account Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your profile and account.</p>
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Profile</h2>
          <p className="text-sm text-gray-500 mb-4">
            Your profile is managed by your Google account.
          </p>
          <div className="flex items-center gap-4">
            {pictureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pictureUrl} alt="Profile" className="h-14 w-14 rounded-full" />
            )}
            <div>
              {name && <p className="text-sm font-medium text-gray-900">{name}</p>}
              <p className="text-sm text-gray-500">{email}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Security</h2>
          <p className="text-sm text-gray-500">
            You can sign in with your Google account, or with your Google email
            address and your DeskMind password. Your Google account security is
            managed by Google.
          </p>
        </Card>

        <Card className="p-6 border-error/20">
          <h2 className="text-lg font-semibold text-error mb-1">Danger Zone</h2>
          <p className="text-sm text-gray-500 mb-4">Once you delete your account, there is no going back.</p>
          <Button variant="danger" onClick={() => setShowDeleteDialog(true)} isLoading={deleting}>
            Delete account
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteAccount}
        title="Delete account"
        description="This will permanently delete your account and all associated data. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}