import React from 'react';
import { motion, Variants } from 'framer-motion';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}

const cardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 30,
    scale: 0.9,
  },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      delay: index * 0.1,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: {
      duration: 0.2,
    },
  },
};



export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  className = '',
  index = 0,
  onClick,
  disabled = false,
  selected = false,
}) => {
  const isInteractive = onClick && !disabled;

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={isInteractive ? 'hover' : undefined}
      whileTap={isInteractive ? 'tap' : undefined}
      onClick={isInteractive ? onClick : undefined}
      className={`${className} ${isInteractive ? 'cursor-pointer' : ''} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      style={{
        boxShadow: selected ? '0 0 30px 5px rgba(6, 182, 212, 0.5)' : undefined,
      }}
    >
      {children}
    </motion.div>
  );
};

// Staggered container for multiple cards
interface AnimatedCardContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

export const AnimatedCardContainer: React.FC<AnimatedCardContainerProps> = ({
  children,
  className = '',
}) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
};
