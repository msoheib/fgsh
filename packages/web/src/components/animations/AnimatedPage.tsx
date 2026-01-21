import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';

interface AnimatedPageProps {
  children: React.ReactNode;
  className?: string;
}

const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export const AnimatedPage: React.FC<AnimatedPageProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Page wrapper with AnimatePresence for route transitions
interface AnimatedRouteProps {
  children: React.ReactNode;
  locationKey: string;
}

export const AnimatedRoute: React.FC<AnimatedRouteProps> = ({ children, locationKey }) => {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={locationKey}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
