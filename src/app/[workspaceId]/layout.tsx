import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const { workspaceId } = await params;

  const supabase = createServiceClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .single();

  if (!workspace) {
    notFound();
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceId={workspace.id} workspaceName={workspace.name} />
      <main className="ml-60 flex-1 bg-gray-50 p-6 min-h-screen">
        {children}
      </main>
    </div>
  );
}
