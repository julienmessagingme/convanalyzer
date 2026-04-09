import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings, Users, Briefcase } from "lucide-react";
import { getSessionFromMiddlewareHeader } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";

export const dynamic = "force-dynamic";

/**
 * Admin area is only accessible to local admin accounts. SSO users and
 * non-admin roles are redirected to the landing page.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) redirect("/login");
  if (session.role !== "admin" || session.authType !== "local") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
            >
              <Settings className="h-4 w-4" />
              Administration
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/admin/workspaces"
                className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
              >
                <Briefcase className="h-4 w-4" />
                Workspaces
              </Link>
              <Link
                href="/admin/users"
                className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
              >
                <Users className="h-4 w-4" />
                Utilisateurs
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Retour dashboard
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
