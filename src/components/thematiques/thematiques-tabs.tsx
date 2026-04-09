import Link from "next/link";
import { Smile, AlertTriangle } from "lucide-react";

interface ThematiquesTabsProps {
  activeAxis: "sentiment" | "urgency";
  workspaceId: string;
}

export function ThematiquesTabs({
  activeAxis,
  workspaceId,
}: ThematiquesTabsProps) {
  const tabs = [
    {
      key: "sentiment" as const,
      label: "Par sentiment",
      icon: Smile,
    },
    {
      key: "urgency" as const,
      label: "Par urgence",
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-0" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = activeAxis === tab.key;
          const Icon = tab.icon;
          const href = `/${workspaceId}/thematiques?axis=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
