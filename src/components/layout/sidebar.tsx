"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, Tags, BarChart3, Search, Repeat, Layers, Users } from "lucide-react";

interface SidebarProps {
  workspaceId: string;
  workspaceName: string;
  userEmail?: string;
  canLogout?: boolean;
  canSwitchWorkspace?: boolean;
  /**
   * When true, only the "Dashboard" item is clickable. All other items
   * are rendered as disabled with opacity and a tooltip. Set from the
   * server layout based on isRestrictedSession (SSO client sessions
   * from restricted hostnames). Admin sessions always get false.
   */
  restrictedMode?: boolean;
}

const navItems = [
  {
    label: "Dashboard",
    href: (id: string) => `/${id}`,
    icon: LayoutDashboard,
    exact: true,
    alwaysAvailable: true,
  },
  {
    label: "Conversations",
    href: (id: string) => `/${id}/conversations`,
    icon: MessageSquare,
    exact: false,
    alwaysAvailable: false,
  },
  {
    label: "Visiteurs",
    href: (id: string) => `/${id}/visiteurs`,
    icon: Users,
    exact: false,
    alwaysAvailable: false,
  },
  {
    label: "Recherche",
    href: (id: string) => `/${id}/search`,
    icon: Search,
    exact: false,
    alwaysAvailable: false,
  },
  {
    label: "Iterations",
    href: (id: string) => `/${id}/iterations`,
    icon: Repeat,
    exact: false,
    alwaysAvailable: false,
  },
  {
    label: "Thematiques",
    href: (id: string) => `/${id}/thematiques`,
    icon: Layers,
    exact: false,
    alwaysAvailable: false,
  },
  {
    label: "Analytics",
    href: (id: string) => `/${id}/analytics`,
    icon: BarChart3,
    exact: false,
    alwaysAvailable: false,
  },
  {
    label: "Tags",
    href: (id: string) => `/${id}/tags`,
    icon: Tags,
    exact: false,
    alwaysAvailable: false,
  },
];

export function Sidebar({
  workspaceId,
  workspaceName,
  userEmail,
  canLogout,
  canSwitchWorkspace,
  restrictedMode = false,
}: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 border-r border-gray-200 bg-white flex flex-col">
      <Link href={`/${workspaceId}`} className="block px-4 py-5 hover:bg-gray-50 transition-colors">
        <h1 className="text-lg font-semibold text-gray-900">
          Conversation Analyzer
        </h1>
      </Link>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const href = item.href(workspaceId);
          const active = isActive(href, item.exact);
          const disabled = restrictedMode && !item.alwaysAvailable;

          if (disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-400 opacity-50 cursor-not-allowed select-none"
                title="Non disponible dans votre offre"
                aria-disabled="true"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-4 py-3">
        <p className="text-sm text-gray-500 truncate mb-1">{workspaceName}</p>
        {userEmail ? (
          <p className="text-xs text-gray-400 truncate">{userEmail}</p>
        ) : null}
        <p className="text-xs text-gray-400">Powered by MessagingMe</p>
        {(canSwitchWorkspace || canLogout) ? (
          <div className="mt-2 flex flex-col gap-1">
            {canSwitchWorkspace ? (
              <Link
                href="/"
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Changer de workspace
              </Link>
            ) : null}
            {canLogout ? <SidebarLogout /> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function SidebarLogout() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  async function onLogout() {
    await fetch(`${basePath}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    window.location.href = `${basePath}/login`;
  }
  return (
    <button
      onClick={onLogout}
      className="text-left text-xs text-gray-500 hover:text-gray-700"
    >
      Se déconnecter
    </button>
  );
}
