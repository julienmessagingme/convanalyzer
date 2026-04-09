"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface LoginFormProps {
  nextPath?: string;
  initialError?: string;
}

export function LoginForm({ nextPath, initialError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isPending, startTransition] = useTransition();

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${basePath}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      setError(body.error ?? "Erreur de connexion");
      return;
    }
    startTransition(() => {
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="julien@messagingme.fr"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Mot de passe"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? "Connexion..." : "Se connecter"}
      </button>
    </form>
  );
}
