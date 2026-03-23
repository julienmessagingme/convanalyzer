interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
}

export function KpiCard({ title, value, subtitle, icon }: KpiCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {icon && <div className="mb-3 text-gray-400">{icon}</div>}
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
        {title}
      </p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {subtitle && (
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      )}
    </div>
  );
}
