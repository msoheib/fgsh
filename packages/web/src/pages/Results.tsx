import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { LeaveGameButton } from '../components/LeaveGameButton';
import { useGameStore, ScoringService } from '@fakash/shared';

export const Results: React.FC = () => {
  const navigate = useNavigate();
  const { game, leaveGame } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    if (!game) {
      navigate('/');
      return;
    }

    // Fetch final leaderboard
    const fetchLeaderboard = async () => {
      try {
        const data = await ScoringService.getFinalLeaderboard(game.id);
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      }
    };

    fetchLeaderboard();
  }, [game, navigate]);

  if (!game) {
    return null;
  }

  const winner = leaderboard[0];

  const getRankGradient = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-gold';
      case 2:
        return 'bg-gradient-silver';
      case 3:
        return 'bg-gradient-bronze';
      default:
        return 'glass';
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <Logo size="md" className="mb-4 sm:mb-6" />

      {winner && (
        <div className="mb-6 sm:mb-8 text-center animate-celebrate">
          <p className="text-3xl sm:text-4xl mb-3 sm:mb-4">🎉</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2">الفائز!</h1>
          <p className="text-2xl sm:text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            {winner.player.user_name}
          </p>
          <p className="text-lg sm:text-xl mt-2">
            {winner.player.score} نقطة
          </p>
        </div>
      )}

      <GlassCard className="max-w-2xl w-full">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-4 sm:mb-6">لوحة المتصدرين</h2>

        <div className="space-y-2 sm:space-y-3">
          {leaderboard.map(({ player, rank }) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl ${getRankGradient(
                rank
              )}`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center font-bold text-xl sm:text-2xl">
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                </div>
                <PlayerAvatar
                  name={player.user_name}
                  color={player.avatar_color}
                  isHost={player.is_host}
                  size="md"
                />
              </div>

              <p className="flex-1 font-bold text-base sm:text-lg truncate">{player.user_name}</p>

              <div className="text-left">
                <p className="text-2xl sm:text-3xl font-bold">{player.score}</p>
                <p className="text-xs sm:text-sm text-white/60">نقطة</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6 sm:mt-8">
          <LeaveGameButton
            variant="secondary"
            size="lg"
            className="flex-1"
          />

          <GradientButton
            variant="pink"
            onClick={() => {
              // Clean up current session before starting new game
              leaveGame();
              navigate('/create');
            }}
            className="flex-1"
          >
            لعب مرة أخرى
          </GradientButton>
        </div>
      </GlassCard>
    </div>
  );
};
