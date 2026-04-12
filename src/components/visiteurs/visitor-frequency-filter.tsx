import Link from "next/link";

interface FilterChip {
  label: string;
  value: string;
}

const CHIPS: FilterChip[] = [
  { label: "Tous", value: "1" },
  { label: "2+", value: "2" },
  { label: "3+", value: "3" },
  { label: "5+", value: "5" },
  { label: "7+", value: "7" },
];

interface VisitorFrequencyFilterProps {
  currentMin: string;
  basePath: string;
}

export function VisitorFrequencyFilter({
  currentMin,
  basePath,
}: VisitorFrequencyFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-500">Frequence minimale :</span>
      {CHIPS.map((chip) => {
        const isActive = currentMin === chip.value;
        return (
          <Link
            key={chip.value}
            href={`${basePath}?min=${chip.value}`}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}
