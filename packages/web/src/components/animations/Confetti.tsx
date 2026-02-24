import { useCallback, useEffect } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiOptions {
  type?: 'burst' | 'shower' | 'fireworks' | 'celebration';
  duration?: number;
  colors?: string[];
}

// Default fgsh theme colors
const defaultColors = ['#7c3aed', '#06b6d4', '#ec4899', '#fbbf24', '#22d3ee'];

// Burst confetti from center
export const burstConfetti = (options?: ConfettiOptions) => {
  const colors = options?.colors || defaultColors;
  
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors,
  });
};

// Shower confetti from top
export const showerConfetti = (options?: ConfettiOptions) => {
  const colors = options?.colors || defaultColors;
  const duration = options?.duration || 3000;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };

  frame();
};

// Fireworks effect
export const fireworksConfetti = (options?: ConfettiOptions) => {
  const colors = options?.colors || defaultColors;
  const duration = options?.duration || 5000;
  const end = Date.now() + duration;

  const interval = setInterval(() => {
    if (Date.now() > end) {
      clearInterval(interval);
      return;
    }

    confetti({
      particleCount: 50,
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      origin: {
        x: Math.random(),
        y: Math.random() - 0.2,
      },
      colors,
    });
  }, 250);
};

// Winner celebration - side cannons
export const celebrationConfetti = (options?: ConfettiOptions) => {
  const colors = options?.colors || defaultColors;
  const duration = options?.duration || 3000;
  
  // Initial big burst
  confetti({
    particleCount: 150,
    spread: 100,
    origin: { y: 0.5 },
    colors,
  });

  // Side cannons
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 80,
      origin: { x: 0 },
      colors,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 80,
      origin: { x: 1 },
      colors,
    });
  }, 200);

  // Final shower
  setTimeout(() => {
    showerConfetti({ duration: duration - 500, colors });
  }, 400);
};

// Hook to trigger confetti
export const useConfetti = () => {
  const burst = useCallback((options?: ConfettiOptions) => burstConfetti(options), []);
  const shower = useCallback((options?: ConfettiOptions) => showerConfetti(options), []);
  const fireworks = useCallback((options?: ConfettiOptions) => fireworksConfetti(options), []);
  const celebration = useCallback((options?: ConfettiOptions) => celebrationConfetti(options), []);

  return { burst, shower, fireworks, celebration };
};

// Component that triggers confetti on mount
interface ConfettiTriggerProps {
  type?: 'burst' | 'shower' | 'fireworks' | 'celebration';
  trigger?: boolean;
  colors?: string[];
  duration?: number;
}

export const ConfettiTrigger: React.FC<ConfettiTriggerProps> = ({
  type = 'burst',
  trigger = true,
  colors,
  duration,
}) => {
  useEffect(() => {
    if (!trigger) return;

    const options = { colors, duration };
    switch (type) {
      case 'burst':
        burstConfetti(options);
        break;
      case 'shower':
        showerConfetti(options);
        break;
      case 'fireworks':
        fireworksConfetti(options);
        break;
      case 'celebration':
        celebrationConfetti(options);
        break;
    }
  }, [trigger, type, colors, duration]);

  return null;
};

import React from 'react';
