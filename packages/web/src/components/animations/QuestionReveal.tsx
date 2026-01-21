import React from 'react';
import { motion, Variants } from 'framer-motion';

interface QuestionRevealProps {
  question: string;
  className?: string;
  showEmoji?: boolean;
  size?: 'normal' | 'large' | 'tv';
}

const questionVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    filter: 'blur(10px)',
  },
  visible: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

const emojiVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0,
    rotate: -180,
  },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 15,
      delay: 0.2,
    },
  },
};

const glowVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: [0, 0.5, 0.3],
    transition: {
      duration: 1.5,
      ease: 'easeInOut',
    },
  },
};

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export const QuestionReveal: React.FC<QuestionRevealProps> = ({
  question,
  className = '',
  showEmoji = true,
  size = 'normal',
}) => {
  const sizeClasses = {
    normal: 'text-lg sm:text-2xl',
    large: 'text-2xl sm:text-3xl md:text-4xl',
    tv: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl',
  };

  const emojiSize = {
    normal: 'text-3xl sm:text-5xl',
    large: 'text-4xl sm:text-6xl',
    tv: 'text-5xl sm:text-7xl md:text-8xl',
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={`relative ${className}`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {showEmoji && (
          <motion.div
            variants={emojiVariants}
            className={emojiSize[size]}
          >
            ❓
          </motion.div>
        )}
        <motion.div
          variants={questionVariants}
          className="flex-1 glass rounded-2xl p-4 sm:p-6 relative overflow-hidden"
        >
          {/* Subtle glow effect */}
          <motion.div
            variants={glowVariants}
            className="absolute inset-0 bg-gradient-to-r from-primary-solid/20 via-secondary-main/20 to-accent-main/20 pointer-events-none"
          />
          <h2 className={`${sizeClasses[size]} font-bold text-center relative z-10`}>
            {question}
          </h2>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Dramatic entrance for TV display
export const TVQuestionReveal: React.FC<{ question: string }> = ({ question }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-5xl mx-auto"
    >
      <QuestionReveal
        question={question}
        size="tv"
        showEmoji={true}
      />
    </motion.div>
  );
};
