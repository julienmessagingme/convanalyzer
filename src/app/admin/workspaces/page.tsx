import { createServiceClient } from "@/lib/supabase/server";
import { WorkspaceRow } from "@/components/admin/workspace-row";

export const dynamic = "force-dynamic";

interface WorkspaceWithStats {
  id: string;
  name: string;
  is_active: boolean;
  hostname: string | null;
  user_count: number;
  conversation_count: number;
}

export default async function AdminWorkspacesPage() {
  const supabase = createServiceClient();

  const [workspacesResult, userCountsResult, convCountsResult] =
    await Promise.all([
      supabase
        .from("workspaces")
        .select("id, name, is_active, hostname")
        .order("created_at", { ascending: false }),
      supabase.from("user_workspaces").select("workspace_id"),
      supabase.from("conversations").select("workspace_id"),
    ]);

  const workspaces = workspacesResult.data ?? [];
  const userCounts = new Map<string, number>();
  for (const row of userCountsResult.data ?? []) {
    userCounts.set(row.workspace_id, (userCounts.get(row.workspace_id) ?? 0) + 1);
  }
  const convCounts = new Map<string, number>();
  for (const row of convCountsResult.data ?? []) {
    convCounts.set(row.workspace_id, (convCounts.get(row.workspace_id) ?? 0) + 1);
  }

  const rows: WorkspaceWithStats[] = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    is_active: w.is_active,
    hostname: w.hostname,
    user_count: userCounts.get(w.id) ?? 0,
    conversation_count: convCounts.get(w.id) ?? 0,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
        <p className="mt-1 text-sm text-gray-500">
          Associez un hostname à chaque workspace pour activer le SSO client.
          Les utilisateurs accédant via ce hostname seront automatiquement
          connectés à ce workspace.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Hostname SSO</th>
              <th className="px-4 py-3 font-medium">Utilisateurs</th>
              <th className="px-4 py-3 font-medium">Conversations</th>
              <th className="px-4 py-3 font-medium">Actif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <WorkspaceRow key={row.id} workspace={row} />
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  Aucun workspace.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
