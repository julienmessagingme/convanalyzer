import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  getSessionFromMiddlewareHeader,
  listAccessibleWorkspaces,
  findOrCreateSsoUser,
} from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSessionFromMiddlewareHeader();

  // Middleware should have redirected unauthenticated users. Belt and braces.
  if (!session) redirect("/login");

  // Ensure SSO users have a real DB row for the admin user list + last_login.
  // This is a no-op for local (admin) sessions.
  if (session.authType === "sso" && session.externalHostname) {
    await findOrCreateSsoUser({
      externalHostname: session.externalHostname,
      externalId: session.userId.replace(/^sso:[^:]+:/, ""),
      email: session.email,
      role: "client",
    });
  }

  const workspaces = await listAccessibleWorkspaces(session);

  // Single-workspace users (typical SSO client) skip the selector entirely.
  if (workspaces.length === 1) {
    redirect(`/${workspaces[0].id}`);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Conversation Analyzer
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Connecté en tant que{" "}
              <span className="font-medium text-gray-700">{session.email}</span>
              {session.role === "admin" ? (
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                  Admin
                </span>
              ) : null}
            </p>
          </div>
          <LogoutButton />
        </div>

        {workspaces.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center ring-1 ring-gray-200">
            <p className="text-gray-600">
              Aucun workspace ne vous est accessible.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Contactez MessagingMe pour obtenir l&apos;accès.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
              Vos workspaces
            </h2>
            <ul className="space-y-2">
              {workspaces.map((ws) => (
                <li key={ws.id}>
                  <Link
                    href={`/${ws.id}`}
                    className="flex items-center justify-between rounded-lg bg-white px-4 py-3 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:ring-gray-300"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{ws.name}</p>
                      <p className="text-xs text-gray-500">ID: {ws.id}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
