import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGameSession } from '@fakash/shared';

/**
 * Deep link handler for /game/:code URLs
 * Redirects to appropriate route based on session state
 */
export const GameDeepLink: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!code) {
      navigate('/', { replace: true });
      return;
    }

    // Check if there's an existing session
    const session = getGameSession();

    if (session && session.gameCode.toUpperCase() === code.toUpperCase()) {
      // Session exists and matches this game code - redirect to /game
      // The rehydration logic in App.tsx will handle restoring the session
      navigate('/game', { replace: true });
    } else {
      // No session or different game - redirect to join page with code pre-filled
      navigate('/join', { replace: true, state: { gameCode: code.toUpperCase() } });
    }
  }, [code, navigate]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-gradient-primary flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white text-lg">جارٍ التحميل...</p>
      </div>
    </div>
  );
};
