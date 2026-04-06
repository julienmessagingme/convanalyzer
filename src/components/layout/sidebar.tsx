"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, Tags, Lightbulb, BarChart3, Search, Repeat } from "lucide-react";

interface SidebarProps {
  workspaceId: string;
  workspaceName: string;
}

const navItems = [
  {
    label: "Dashboard",
    href: (id: string) => `/${id}`,
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Conversations",
    href: (id: string) => `/${id}/conversations`,
    icon: MessageSquare,
    exact: false,
  },
  {
    label: "Recherche",
    href: (id: string) => `/${id}/search`,
    icon: Search,
    exact: false,
  },
  {
    label: "Iterations",
    href: (id: string) => `/${id}/iterations`,
    icon: Repeat,
    exact: false,
  },
  {
    label: "Analytics",
    href: (id: string) => `/${id}/analytics`,
    icon: BarChart3,
    exact: false,
  },
  {
    label: "Tags",
    href: (id: string) => `/${id}/tags`,
    icon: Tags,
    exact: false,
  },
  {
    label: "Suggestions KB",
    href: (id: string) => `/${id}/suggestions`,
    icon: Lightbulb,
    exact: false,
  },
];

export function Sidebar({ workspaceId, workspaceName }: SidebarProps) {
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
        <p className="text-xs text-gray-400">Powered by MessagingMe</p>
      </div>
    </aside>
  );
}
