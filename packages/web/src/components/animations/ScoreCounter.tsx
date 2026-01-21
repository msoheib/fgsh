import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface ScoreCounterProps {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showChange?: boolean;
  previousValue?: number;
}

export const ScoreCounter: React.FC<ScoreCounterProps> = ({
  value,
  duration = 1,
  className = '',
  suffix = '',
  size = 'md',
  showChange = false,
  previousValue = 0,
}) => {
  const spring = useSpring(previousValue, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });
  
  const display = useTransform(spring, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState(previousValue);

  useEffect(() => {
    spring.set(value);
    const unsubscribe = display.on('change', (latest) => {
      setDisplayValue(latest);
    });
    return unsubscribe;
  }, [value, spring, display]);

  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl sm:text-3xl',
    lg: 'text-3xl sm:text-4xl md:text-5xl',
    xl: 'text-4xl sm:text-5xl md:text-6xl',
  };

  const change = value - previousValue;
  const isPositive = change > 0;

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      <motion.span
        className={`${sizeClasses[size]} font-bold tabular-nums`}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        {displayValue}
        {suffix}
      </motion.span>
      
      {showChange && change !== 0 && (
        <motion.span
          initial={{ opacity: 0, y: 10, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10 }}
          className={`text-sm font-bold ${
            isPositive ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {isPositive ? '+' : ''}{change}
        </motion.span>
      )}
    </div>
  );
};

// Animated rank display with medal
interface RankDisplayProps {
  rank: number;
  showAnimation?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const RankDisplay: React.FC<RankDisplayProps> = ({
  rank,
  showAnimation = true,
  size = 'md',
}) => {
  const getMedal = () => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return rank.toString();
    }
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-xl',
    md: 'w-10 h-10 text-2xl',
    lg: 'w-14 h-14 text-3xl',
  };

  const content = (
    <div className={`${sizeClasses[size]} flex items-center justify-center font-bold`}>
      {getMedal()}
    </div>
  );

  if (!showAnimation) return content;

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 15,
        delay: rank * 0.2,
      }}
    >
      {content}
    </motion.div>
  );
};
