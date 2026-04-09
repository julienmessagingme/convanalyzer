"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";

interface WorkspaceRowProps {
  workspace: {
    id: string;
    name: string;
    is_active: boolean;
    hostname: string | null;
    user_count: number;
    conversation_count: number;
  };
}

export function WorkspaceRow({ workspace }: WorkspaceRowProps) {
  const [editing, setEditing] = useState(false);
  const [hostname, setHostname] = useState(workspace.hostname ?? "");
  const [currentHostname, setCurrentHostname] = useState(workspace.hostname);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  async function save() {
    setError(null);
    const res = await fetch(`${basePath}/api/admin/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostname: hostname.trim() || null }),
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Erreur" }));
      setError(body.error ?? "Erreur");
      return;
    }
    startTransition(() => {
      setCurrentHostname(hostname.trim() || null);
      setEditing(false);
    });
  }

  function cancel() {
    setHostname(currentHostname ?? "");
    setError(null);
    setEditing(false);
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{workspace.name}</div>
        <div className="text-xs text-gray-500">ID: {workspace.id}</div>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="client.messagingme.app"
              className="w-60 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <button
              onClick={save}
              disabled={isPending}
              className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
              aria-label="Sauvegarder"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={cancel}
              disabled={isPending}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              aria-label="Annuler"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {currentHostname ? (
              <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-800">
                {currentHostname}
              </code>
            ) : (
              <span className="text-xs italic text-gray-400">non défini</span>
            )}
            <button
              onClick={() => setEditing(true)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Modifier"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {error ? (
          <div className="mt-1 text-xs text-red-600">{error}</div>
        ) : null}
      </td>
      <td className="px-4 py-3 text-gray-700">{workspace.user_count}</td>
      <td className="px-4 py-3 text-gray-700">
        {workspace.conversation_count.toLocaleString("fr-FR")}
      </td>
      <td className="px-4 py-3">
        {workspace.is_active ? (
          <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
            Actif
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
            Inactif
          </span>
        )}
      </td>
    </tr>
  );
}
