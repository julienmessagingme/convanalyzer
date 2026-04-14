"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Bot, User } from "lucide-react";

interface ConversationTabsProps {
  activeTab: "bot" | "agent";
  botCount: number;
  agentCount: number;
  onTabChange?: (tab: "bot" | "agent") => void;
}

export function ConversationTabs({
  activeTab,
  botCount,
  agentCount,
  onTabChange,
}: ConversationTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const switchTab = useCallback(
    (tab: "bot" | "agent") => {
      if (onTabChange) {
        onTabChange(tab);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, searchParams, pathname, onTabChange]
  );

  const tabs = [
    {
      key: "bot" as const,
      label: "Conversations IA",
      count: botCount,
      icon: Bot,
    },
    {
      key: "agent" as const,
      label: "Conversations avec humain",
      count: agentCount,
      icon: User,
    },
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-0" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
