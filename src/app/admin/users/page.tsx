import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  role: "admin" | "client";
  auth_type: "local" | "sso";
  external_hostname: string | null;
  created_at: string;
  last_login_at: string | null;
  workspace_ids: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminUsersPage() {
  const supabase = createServiceClient();

  const [usersResult, grantsResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, role, auth_type, external_hostname, created_at, last_login_at")
      .order("created_at", { ascending: false }),
    supabase.from("user_workspaces").select("user_id, workspace_id"),
  ]);

  const grantsByUser = new Map<string, string[]>();
  for (const row of grantsResult.data ?? []) {
    const list = grantsByUser.get(row.user_id) ?? [];
    list.push(row.workspace_id);
    grantsByUser.set(row.user_id, list);
  }

  const users: UserRow[] = (usersResult.data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    auth_type: u.auth_type,
    external_hostname: u.external_hostname,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    workspace_ids: grantsByUser.get(u.id) ?? [],
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Liste de tous les utilisateurs. Les utilisateurs SSO sont créés
          automatiquement à leur première visite depuis un hostname client.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Hostname SSO</th>
              <th className="px-4 py-3 font-medium">Dernière connexion</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {u.email}
                </td>
                <td className="px-4 py-3">
                  {u.role === "admin" ? (
                    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                      admin
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                      client
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {u.auth_type === "local" ? "Local" : "SSO"}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {u.external_hostname ? (
                    <code className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                      {u.external_hostname}
                    </code>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(u.last_login_at)}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(u.created_at)}
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  Aucun utilisateur.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
