-- Fakash Game Database Schema
-- Migration: Initial schema setup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- 1. Games Table
-- ================================================
CREATE TABLE games (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  host_id UUID,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  round_count INTEGER DEFAULT 4 CHECK (round_count BETWEEN 4 AND 10),
  current_round INTEGER DEFAULT 0 CHECK (current_round >= 0),
  max_players INTEGER DEFAULT 10 CHECK (max_players BETWEEN 4 AND 10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 2. Players Table
-- ================================================
CREATE TABLE players (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_name VARCHAR(50) NOT NULL,
  avatar_color VARCHAR(7) DEFAULT '#7c3aed',
  score INTEGER DEFAULT 0 CHECK (score >= 0),
  is_host BOOLEAN DEFAULT FALSE,
  connection_status VARCHAR(20) DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, user_name)
);

-- ================================================
-- 3. Questions Table
-- ================================================
CREATE TABLE questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  category VARCHAR(50),
  difficulty VARCHAR(20) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  language VARCHAR(2) DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 4. Game Rounds Table
-- ================================================
CREATE TABLE game_rounds (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  question_id UUID NOT NULL REFERENCES questions(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'answering', 'voting', 'completed')),
  timer_starts_at TIMESTAMP WITH TIME ZONE,
  timer_duration INTEGER DEFAULT 30 CHECK (timer_duration > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, round_number)
);

-- ================================================
-- 5. Player Answers Table
-- ================================================
CREATE TABLE player_answers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(round_id, player_id)
);

-- ================================================
-- 6. Votes Table
-- ================================================
CREATE TABLE votes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  answer_id UUID NOT NULL REFERENCES player_answers(id) ON DELETE CASCADE,
  points_earned INTEGER DEFAULT 0 CHECK (points_earned >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(round_id, voter_id),
  -- Prevent voting for own answer
  CONSTRAINT no_self_vote CHECK (voter_id != (SELECT player_id FROM player_answers WHERE id = answer_id))
);

-- ================================================
-- Indexes for Performance
-- ================================================
CREATE INDEX idx_games_code ON games(code);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_players_game_id ON players(game_id);
CREATE INDEX idx_players_is_host ON players(is_host);
CREATE INDEX idx_game_rounds_game_id ON game_rounds(game_id);
CREATE INDEX idx_game_rounds_status ON game_rounds(status);
CREATE INDEX idx_player_answers_round_id ON player_answers(round_id);
CREATE INDEX idx_player_answers_player_id ON player_answers(player_id);
CREATE INDEX idx_votes_round_id ON votes(round_id);
CREATE INDEX idx_votes_voter_id ON votes(voter_id);
CREATE INDEX idx_votes_answer_id ON votes(answer_id);

-- ================================================
-- Updated At Trigger Function
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to games table
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- Row Level Security Policies
-- ================================================

-- Enable RLS on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Games: Anyone can read, only allow creating new games
CREATE POLICY "Games are viewable by everyone" ON games
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create a game" ON games
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Host can update their game" ON games
  FOR UPDATE USING (true); -- Simplified for MVP, can add auth later

-- Players: Anyone can view players in a game, join games, update their own player
CREATE POLICY "Players are viewable by everyone" ON players
  FOR SELECT USING (true);

CREATE POLICY "Anyone can join a game" ON players
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Players can update their own record" ON players
  FOR UPDATE USING (true);

-- Questions: Read-only for everyone
CREATE POLICY "Questions are viewable by everyone" ON questions
  FOR SELECT USING (true);

-- Game Rounds: Everyone can view and insert
CREATE POLICY "Game rounds are viewable by everyone" ON game_rounds
  FOR SELECT USING (true);

CREATE POLICY "Game rounds can be created" ON game_rounds
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Game rounds can be updated" ON game_rounds
  FOR UPDATE USING (true);

-- Player Answers: Everyone can view and submit
CREATE POLICY "Player answers are viewable by everyone" ON player_answers
  FOR SELECT USING (true);

CREATE POLICY "Players can submit answers" ON player_answers
  FOR INSERT WITH CHECK (true);

-- Votes: Everyone can view and vote
CREATE POLICY "Votes are viewable by everyone" ON votes
  FOR SELECT USING (true);

CREATE POLICY "Players can cast votes" ON votes
  FOR INSERT WITH CHECK (true);

-- ================================================
-- Comments for Documentation
-- ================================================
COMMENT ON TABLE games IS 'Stores game sessions with configuration and status';
COMMENT ON TABLE players IS 'Players participating in games';
COMMENT ON TABLE questions IS 'Trivia questions pool';
COMMENT ON TABLE game_rounds IS 'Individual rounds within games';
COMMENT ON TABLE player_answers IS 'Player-submitted answers for each round';
COMMENT ON TABLE votes IS 'Votes cast by players during voting phase';
