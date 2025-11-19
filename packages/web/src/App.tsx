import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { initializeSupabase, useGameStore } from '@fakash/shared';

// Pages
import { Home } from './pages/Home';
import { CreateGame } from './pages/CreateGame';
import { JoinGame } from './pages/JoinGame';
import { HowToPlay } from './pages/HowToPlay';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';
import { GameDeepLink } from './pages/GameDeepLink';
import { Results } from './pages/Results';

function AppContent() {
  const navigate = useNavigate();
  const [isRehydrating, setIsRehydrating] = useState(true);

  useEffect(() => {
    // Initialize Supabase
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase credentials. Please check your .env.local file.');
      setIsRehydrating(false);
      return;
    }

    initializeSupabase(supabaseUrl, supabaseAnonKey);

    // Attempt to rehydrate session from localStorage
    const rehydrateSession = useGameStore.getState().rehydrateSession;

    rehydrateSession()
      .then((success) => {
        if (success) {
          // Get the freshly rehydrated game state
          const game = useGameStore.getState().game;
          if (game) {
            // Navigate based on game status
            if (game.status === 'waiting') {
              navigate('/lobby', { replace: true });
            } else if (game.status === 'playing') {
              navigate('/game', { replace: true });
            } else if (game.status === 'finished') {
              navigate('/results', { replace: true });
            }
          }
        }
      })
      .catch((error) => {
        console.error('Failed to rehydrate session:', error);
      })
      .finally(() => {
        setIsRehydrating(false);
      });
  }, [navigate]);

  if (isRehydrating) {
    return (
      <div className="min-h-screen bg-gradient-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/how-to-play" element={<HowToPlay />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/game/:code" element={<GameDeepLink />} />
        <Route path="/game" element={<Game />} />
        <Route path="/results" element={<Results />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            padding: '16px',
            direction: 'rtl',
          },
        }}
      />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-primary">
        <AppContent />
      </div>
    </BrowserRouter>
  );
}

export default App;
