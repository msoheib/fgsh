-- ============================================================================
-- Migration: Add diagnostic functions for voting system debugging
-- Date: 2024-11-29
-- Purpose: Helper functions to diagnose voting issues
-- ============================================================================

-- Function to check voting status for a round
CREATE OR REPLACE FUNCTION check_voting_status(p_round_id UUID)
RETURNS TABLE (
  round_status TEXT,
  total_answers INTEGER,
  correct_answers INTEGER,
  player_answers INTEGER,
  total_votes INTEGER,
  connected_players INTEGER,
  required_players INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gr.status::TEXT as round_status,
    (SELECT COUNT(*)::INTEGER FROM player_answers WHERE round_id = p_round_id) as total_answers,
    (SELECT COUNT(*)::INTEGER FROM player_answers WHERE round_id = p_round_id AND is_correct = true) as correct_answers,
    (SELECT COUNT(*)::INTEGER FROM player_answers WHERE round_id = p_round_id AND is_correct = false) as player_answers,
    (SELECT COUNT(DISTINCT voter_id)::INTEGER FROM votes WHERE round_id = p_round_id) as total_votes,
    (SELECT COUNT(*)::INTEGER FROM players WHERE game_id = gr.game_id AND connection_status = 'connected') as connected_players,
    gr.required_players::INTEGER as required_players
  FROM game_rounds gr
  WHERE gr.id = p_round_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_voting_status IS
  'Diagnostic function to check voting status for a round. Usage: SELECT * FROM check_voting_status(''round-id-here'');';

-- Function to list all answers for a round with details
CREATE OR REPLACE FUNCTION list_round_answers(p_round_id UUID)
RETURNS TABLE (
  answer_id UUID,
  answer_text TEXT,
  is_correct BOOLEAN,
  player_id UUID,
  player_name TEXT,
  submitted_at TIMESTAMPTZ,
  vote_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pa.id as answer_id,
    pa.answer_text,
    pa.is_correct,
    pa.player_id,
    COALESCE(p.username, 'System') as player_name,
    pa.submitted_at,
    (SELECT COUNT(*) FROM votes WHERE answer_id = pa.id) as vote_count
  FROM player_answers pa
  LEFT JOIN players p ON pa.player_id = p.id
  WHERE pa.round_id = p_round_id
  ORDER BY pa.submitted_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION list_round_answers IS
  'Lists all answers for a round with vote counts. Usage: SELECT * FROM list_round_answers(''round-id-here'');';
