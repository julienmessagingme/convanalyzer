"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  async function onLogout() {
    await fetch(`${basePath}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={onLogout}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      Déconnexion
    </button>
  );
}
