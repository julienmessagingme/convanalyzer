import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import {
  getSessionFromMiddlewareHeader,
  canAccessWorkspace,
  isRestrictedSession,
} from "@/lib/auth/session";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const { workspaceId } = await params;

  // Fire both lookups in parallel: the session check and the workspace
  // existence check are independent (they are only reconciled by the
  // canAccessWorkspace call below). On a typical dashboard load this
  // saves a full Supabase round-trip on the critical path.
  const supabase = createServiceClient();
  const [session, workspaceRes] = await Promise.all([
    getSessionFromMiddlewareHeader(),
    supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .single(),
  ]);

  if (!session) redirect("/login");
  const workspace = workspaceRes.data;
  if (!workspace) notFound();

  const allowed = await canAccessWorkspace(session, workspace.id);
  if (!allowed) {
    // Send them back to the landing page which will filter to what they can see.
    redirect("/");
  }

  // SSO users don't log out here (they use their main site). Admin can log
  // out and also navigate between workspaces.
  const isLocal = session.authType === "local";
  const isAdmin = session.role === "admin";
  const restricted = isRestrictedSession(session);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        userEmail={session.email}
        canLogout={isLocal}
        canSwitchWorkspace={isAdmin}
        restrictedMode={restricted}
      />
      <main className="ml-60 flex-1 bg-gray-50 p-6 min-h-screen">
        {children}
      </main>
    </div>
  );
}
