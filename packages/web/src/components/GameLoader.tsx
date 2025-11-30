import React, { useState, useEffect } from 'react';

const LOADING_MESSAGES = [
  '🎭 نجهز المسرح...',
  '🃏 نخلط الأوراق...',
  '✨ نصقل الأسئلة...',
  '🎪 نرتب الكراسي...',
  '🎯 نجهز التحديات...',
  '🌟 لحظات وتبدأ المتعة...',
];

interface GameLoaderProps {
  message?: string;
  showRetry?: boolean;
  onRetry?: () => void;
  minimal?: boolean;
}

export const GameLoader: React.FC<GameLoaderProps> = ({
  message,
  showRetry = false,
  onRetry,
  minimal = false,
}) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Cycle through fun messages
  useEffect(() => {
    if (message) return; // Don't cycle if custom message provided
    
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
        setIsVisible(true);
      }, 300);
    }, 2500);

    return () => clearInterval(interval);
  }, [message]);

  const displayMessage = message || LOADING_MESSAGES[currentMessageIndex];

  if (minimal) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        {/* Animated dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full bg-gradient-to-r from-primary-main to-secondary-main"
              style={{
                animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
        <p
          className={`text-white/80 text-sm transition-opacity duration-300 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {displayMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        {/* Animated cards stack */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary-main/80 to-secondary-main/80 shadow-lg"
              style={{
                animation: `cardFloat 2s ease-in-out ${i * 0.3}s infinite`,
                transform: `rotate(${(i - 1) * 15}deg)`,
                zIndex: 3 - i,
              }}
            >
              <div className="w-full h-full flex items-center justify-center text-4xl">
                {i === 0 ? '❓' : i === 1 ? '🎭' : '✨'}
              </div>
            </div>
          ))}
        </div>

        {/* Animated message */}
        <p
          className={`text-xl font-bold mb-4 transition-all duration-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}
        >
          {displayMessage}
        </p>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-main), var(--color-secondary-main))',
                animation: `dotPulse 1.5s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Retry button if needed */}
        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-2 rounded-full glass hover:bg-white/20 transition-all text-sm"
          >
            🔄 إعادة المحاولة
          </button>
        )}
      </div>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes cardFloat {
          0%, 100% {
            transform: translateY(0) rotate(var(--rotation, 0deg));
          }
          50% {
            transform: translateY(-10px) rotate(var(--rotation, 0deg));
          }
        }
        
        @keyframes dotPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.5);
            opacity: 1;
          }
        }
        
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.3);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

