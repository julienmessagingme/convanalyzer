import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createServiceClient();
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (workspaces && workspaces.length > 0) {
    redirect(`/${workspaces[0].id}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">Conversation Analyzer</h1>
      <p className="text-lg text-gray-600">
        Aucun workspace configuré.
      </p>
    </main>
  );
}
