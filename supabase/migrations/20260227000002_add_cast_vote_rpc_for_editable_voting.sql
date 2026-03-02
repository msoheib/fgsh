-- Migration: Add cast_vote RPC to support editable votes during active voting timer
-- Behavior:
-- 1) Players can cast or change their vote while the round is in "voting"
-- 2) Vote changes overwrite previous choice for the same (round_id, voter_id)
-- 3) Voting is rejected once the voting timer is expired
-- 4) points_earned is always reset to 0 at vote time; scoring is applied at round completion

CREATE OR REPLACE FUNCTION cast_vote(
  p_round_id UUID,
  p_voter_id UUID,
  p_answer_id UUID
)
RETURNS votes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round game_rounds%ROWTYPE;
  v_answer player_answers%ROWTYPE;
  v_game_id UUID;
  v_deadline TIMESTAMPTZ;
  v_vote votes%ROWTYPE;
BEGIN
  SELECT *
  INTO v_round
  FROM game_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF v_round.id IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF v_round.status <> 'voting' THEN
    RAISE EXCEPTION 'Round is not in voting phase';
  END IF;

  v_deadline := COALESCE(v_round.timer_starts_at, NOW())
    + make_interval(secs => COALESCE(v_round.timer_duration, 0));

  IF NOW() > v_deadline THEN
    RAISE EXCEPTION 'Voting timer expired';
  END IF;

  SELECT *
  INTO v_answer
  FROM player_answers
  WHERE id = p_answer_id;

  IF v_answer.id IS NULL THEN
    RAISE EXCEPTION 'Answer not found';
  END IF;

  IF v_answer.round_id <> p_round_id THEN
    RAISE EXCEPTION 'Answer does not belong to this round';
  END IF;

  SELECT gr.game_id
  INTO v_game_id
  FROM game_rounds gr
  WHERE gr.id = v_answer.round_id;

  IF v_answer.player_id IS NOT NULL AND v_answer.player_id = p_voter_id THEN
    RAISE EXCEPTION 'Cannot vote for own answer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM players p
    WHERE p.id = p_voter_id
      AND p.game_id = v_game_id
  ) THEN
    RAISE EXCEPTION 'Voter does not belong to the round game';
  END IF;

  INSERT INTO votes (round_id, voter_id, answer_id, points_earned)
  VALUES (p_round_id, p_voter_id, p_answer_id, 0)
  ON CONFLICT (round_id, voter_id)
  DO UPDATE
  SET
    answer_id = EXCLUDED.answer_id,
    points_earned = 0
  RETURNING * INTO v_vote;

  RETURN v_vote;
END;
$$;

GRANT EXECUTE ON FUNCTION cast_vote(UUID, UUID, UUID) TO anon, authenticated;

COMMENT ON FUNCTION cast_vote(UUID, UUID, UUID) IS
'Casts or changes a player vote while voting timer is active. Upserts by (round_id, voter_id).';
