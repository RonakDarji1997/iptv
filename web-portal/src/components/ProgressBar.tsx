'use client';

interface ProgressBarProps {
  percentage: number;
  className?: string;
  height?: string;
  showLabel?: boolean;
}

export default function ProgressBar({
  percentage,
  className = '',
  height = 'h-1',
  showLabel = false
}: ProgressBarProps) {
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className={className}>
      {showLabel && (
        <div className="text-xs text-gray-400 mb-1">
          {Math.round(clampedPercentage)}% watched
        </div>
      )}
      <div className={`w-full bg-gray-700 rounded-full overflow-hidden ${height}`}>
        <div
          className="bg-yellow-500 h-full transition-all duration-300 rounded-full"
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
    </div>
  );
}
