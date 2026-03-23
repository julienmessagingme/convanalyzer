interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className ?? ""}`} />
  );
}

export function CardSkeleton() {
  return <Skeleton className="h-32 rounded-lg" />;
}

export function ChartSkeleton() {
  return <Skeleton className="h-64 rounded-lg" />;
}
