import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useGameStore, useRoundStore, useAuthStore, PaymentService, clearGameSession, GameService } from '@fakash/shared';
import { AuthModal } from '../components/auth';
import { UpgradeModal } from '../components/payment';

// All games are created in TV Display Mode only
// The creator and all players join via QR code on their phones
export const CreateGame: React.FC = () => {
  const FIXED_ROUND_COUNT = 7; // 3 + 3 + 1 stage layout
  const FIXED_MAX_PLAYERS = 10;

  const navigate = useNavigate();
  const { createGameAsDisplay, isLoading, error } = useGameStore();
  const { user, loading: authLoading } = useAuthStore();

  // Auth modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isCheckingEntitlement, setIsCheckingEntitlement] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    if (!authLoading && !user) {
      setShowAuthModal(true);
    }
  }, [authLoading, user]);

  const handleCreateGame = async () => {
    // Check authentication
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    // Check payment entitlement
    setIsCheckingEntitlement(true);
    try {
      const entitlement = await PaymentService.checkHostEntitlement();
      if (!entitlement || !entitlement.can_create_games) {
        setShowUpgradeModal(true);
        setIsCheckingEntitlement(false);
        return;
      }
    } catch (err) {
      console.error('Failed to check entitlement:', err);
      // Allow creation anyway if check fails
    }
    setIsCheckingEntitlement(false);

    try {
      // End any existing game first to prevent lingering rooms
      const existingGame = useGameStore.getState().game;
      if (existingGame && existingGame.status !== 'finished') {
        console.log('🗑️ Ending existing game before creating new room:', existingGame.id);
        try {
          await GameService.endGame(existingGame.id);
        } catch (endErr) {
          console.warn('Could not end existing game:', endErr);
          // Continue anyway
        }
      }
      
      // Clear any old game session to prevent flickering
      clearGameSession();
      
      // DEEP RESET: Clear in-memory stores to prevent any state flickering
      useGameStore.getState().reset();
      useRoundStore.getState().reset();
      
      // Always create in TV Display Mode
      await createGameAsDisplay({
        roundCount: FIXED_ROUND_COUNT,
        maxPlayers: FIXED_MAX_PLAYERS,
      });
      // Navigate to TV lobby (display screen)
      navigate('/tv/lobby');
    } catch (err) {
      console.error('Failed to create game:', err);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Session Indicator */}
      {user && (
        <div className="fixed top-4 left-4 z-50">
          <div className="glass px-4 py-2 rounded-full flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary-main to-secondary-light flex items-center justify-center text-xs font-bold">
              {(user.user_metadata?.display_name || user.email)?.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-white/80">
              {user.user_metadata?.display_name || user.email?.split('@')[0] || 'مضيف'}
            </span>
          </div>
        </div>
      )}

      <Logo size="md" className="mb-6 sm:mb-8" />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          navigate('/');
        }}
        onSuccess={() => setShowAuthModal(false)}
      />

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />

      <GlassCard className="max-w-xl w-full">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">إنشاء غرفة 📺</h2>
        
        {/* TV Mode Info */}
        <div className="p-4 bg-secondary-main/20 border border-secondary-main/50 rounded-2xl mb-6">
          <p className="text-sm sm:text-base text-center">
            📱 ستظهر شاشة العرض على هذا الجهاز. الجولة ثابتة: 3 + 3 + 1 أسئلة
          </p>
        </div>

        {error && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-red-500/20 border border-red-500/50 rounded-2xl text-center text-sm sm:text-base">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6 sm:mt-8">
          <GradientButton
            variant="pink"
            onClick={handleCreateGame}
            className="flex-1"
            disabled={isLoading || isCheckingEntitlement}
          >
            {isLoading || isCheckingEntitlement ? <LoadingSpinner size="sm" /> : 'إنشاء غرفة'}
          </GradientButton>

          <GradientButton
            variant="cyan"
            onClick={() => navigate(-1)}
            className="flex-1"
            disabled={isLoading}
          >
            العودة
          </GradientButton>
        </div>
      </GlassCard>
    </div>
  );
};
