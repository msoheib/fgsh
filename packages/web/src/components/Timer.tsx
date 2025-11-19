import React from 'react';

interface TimerProps {
  duration: number; // Total duration in seconds (for calculating percentage)
  timeRemaining: number; // Current time remaining in seconds
  className?: string;
}

export const Timer: React.FC<TimerProps> = ({
  duration,
  timeRemaining,
  className = '',
}) => {
  // Pure presentational component - no state, no intervals
  const percentage = duration > 0 ? (timeRemaining / duration) * 100 : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color based on time left
  const getColor = () => {
    if (percentage > 50) return '#06b6d4'; // Cyan
    if (percentage > 20) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg className="transform -rotate-90" width="100" height="100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="8"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={getColor()}
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold">{timeRemaining}</span>
      </div>
    </div>
  );
};
