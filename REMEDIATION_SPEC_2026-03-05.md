# Fgsh Security Remediation Spec

Spec date: March 5, 2026

## Objective
Close the confirmed production auth and gameplay-integrity gaps while preserving the current product model:
- authenticated hosts
- anonymous players
- TV display as a read-mostly client

This spec is decision-complete and intended for direct implementation.

## Non-Goals
- Do not convert players to mandatory Supabase Auth accounts.
- Do not introduce partial or optional security modes.
- Do not keep legacy public write paths after rollout.

## Core Design Decisions
1. Raw `player_id` is no longer trusted for any mutating action.
2. Every player row gets a server-issued secret, stored only as a hash in the database.
3. All mutating gameplay actions move to token-verified RPCs.
4. Direct public writes to gameplay tables are removed.
5. Host profile updates move to narrow RPCs; direct self-update is removed.
6. Payment status changes become server-only and verified against Moyasar.
7. `is_banned` is enforced for authenticated host accounts only.
   Default chosen: anonymous player bans are out of scope until players have stable identity beyond a throwaway name.
8. The live schema must be re-baselined before or alongside the security rollout because the remote project is drifted relative to tracked migrations.

## Database Changes

### 0. Re-baseline live schema history
Before security cutover, reconcile live schema state with versioned migrations.

Required actions:
- produce a full remote schema dump from the linked project
- compare live objects to the repo migration chain
- identify all manually applied or untracked objects
- create a baseline migration set or a one-time reconciliation migration that makes repo history sufficient to rebuild production
- ensure `supabase migration list` after remediation reflects the actual deployed schema

Objects already known to be drift-sensitive:
- `game_category_prompts`
- `game_audio_cues`
- `cast_vote`
- missing `leave_game_as_player`

Rule:
- do not continue shipping schema changes on top of undocumented production drift

### 1. Player session secret model
Add to `public.players`:
- `session_token_hash text not null`
- `session_token_issued_at timestamptz not null default now()`

Implementation rule:
- raw token is generated server-side with at least 32 random bytes, hex or base64url encoded
- DB stores `encode(digest(raw_token, 'sha256'), 'hex')`
- raw token is returned exactly once from join/create-player RPCs

Helper functions to add:
- `hash_player_token(p_token text) returns text`
- `assert_player_session(p_game_id uuid, p_player_id uuid, p_player_token text) returns players`
- `assert_controller_session(p_game_id uuid, p_player_id uuid, p_player_token text) returns players`

`assert_controller_session` must verify:
- valid player token
- player belongs to the game
- player is connected
- `games.host_id = p_player_id OR games.phase_captain_id = p_player_id`

### 2. Replace public join/player creation with RPCs
Add RPCs:
- `join_game(p_code text, p_player_name text, p_avatar_color text default null)`
  - validates game exists and is `waiting`
  - rejects banned authenticated hosts trying to create/join as host-owned controllers
  - creates new player row
  - generates and stores `session_token_hash`
  - returns `game`, `player`, `player_token`
- `reconnect_player_session(p_game_id uuid, p_player_id uuid, p_player_token text)`
  - verifies token
  - marks player connected
  - returns `game`, `player`

Default reconnect behavior:
- reconnect by token only
- reconnect-by-name is removed
- if client loses the token, that player seat is not recoverable

### 3. Replace public gameplay writes with token-verified RPCs
Add or replace with these signatures:
- `create_round(p_game_id uuid, p_round_number int, p_player_id uuid, p_player_token text, p_language text default 'ar', p_category text default null)`
- `submit_answer(p_round_id uuid, p_player_id uuid, p_player_token text, p_answer_text text)`
- `cast_vote(p_round_id uuid, p_voter_id uuid, p_player_token text, p_answer_id uuid)`
- `start_game_as_player(p_game_id uuid, p_player_id uuid, p_player_token text)`
- `advance_to_next_round_by_player(p_game_id uuid, p_player_id uuid, p_player_token text)`
- `leave_game_as_player(p_game_id uuid, p_player_id uuid, p_player_token text)`
- `claim_phase_captain_if_unassigned(p_game_id uuid, p_player_id uuid, p_player_token text)`
- `promote_phase_captain(p_game_id uuid, p_disconnected_player_id uuid, p_caller_player_id uuid, p_caller_player_token text)`
- `save_game_category_prompt(p_game_id uuid, p_round_number int, p_player_id uuid, p_player_token text, p_options jsonb default null, p_selected_category text default null)`

Function rules:
- every function must call `assert_player_session` or `assert_controller_session`
- `promote_phase_captain` must additionally verify:
  - caller is a connected player in the same game
  - target player is the current `phase_captain_id`
  - target player is actually disconnected or heartbeat-stale before promotion
- `save_game_category_prompt` must allow only the controller to write options/selection
- `create_round` is controller-only and becomes the only supported path for `game_rounds` insertion

### 4. Remove public write access from gameplay tables
After client rollout, revoke and replace policies so anon/authenticated clients cannot directly mutate:
- `players`
- `game_rounds`
- `player_answers`
- `votes`
- `game_category_prompts`

Target policy state:
- `SELECT` remains public only where gameplay display requires it
- `INSERT/UPDATE/DELETE` for the above tables are denied to anon/authenticated
- only RPCs perform writes

Specific cleanup:
- drop permissive policies inherited from `20241021000001_initial_schema.sql`
- drop current writable policy on `game_category_prompts`

### 5. Host profile hardening
Replace direct table updates with RPC-only writes.

Policy changes:
- remove self-update policy from `host_profiles`
- remove broad admin direct-update policy from `host_profiles`
- keep read policies as needed

Allowed write paths:
- `update_host_display_name(p_display_name text)`
- `admin_set_host_ban(p_target_user_id uuid, p_is_banned boolean)`
- `admin_set_host_admin(p_target_user_id uuid, p_is_admin boolean)`
- `admin_set_host_approval(p_target_user_id uuid, p_is_approved boolean)`
- optional `admin_update_host_display_name(...)`

Rules:
- user-facing profile page can change `display_name` only
- admin RPCs require approved admin status inside the function body
- service-role only paths remain responsible for payment and subscription fields

### 6. Enforce host bans
Ban semantics:
- `is_banned` applies to authenticated host accounts only

Required enforcement points:
- `create_authenticated_game` rejects banned hosts
- host sign-in/session restore path loads `host_profiles`; if banned, immediately sign out and block host UI
- admin panel rejects banned accounts
- payment upgrade flows reject banned hosts

Product/UI changes:
- admin UI label changes from "banned users cannot play" to "banned hosts cannot sign in, host, or access admin"

### 7. Payment path hardening
Current client-side `update_payment_status` flow must be removed.

DB changes:
- `create_payment_record` new signature:
  - `create_payment_record(p_plan_id varchar(50), p_moyasar_payment_id varchar(255), p_callback_plan varchar(50) default null)`
  - derive amount, currency, description, and tier server-side from the approved plan catalog
- revoke execute on `update_payment_status` from `anon`, `authenticated`, and `public`
- ideally move `update_payment_status` to a private schema, or keep in `public` but with explicit revokes

Edge Function changes:
- keep `moyasar-webhook` server-only
- deploy `moyasar-webhook` to the linked project as part of the remediation rollout
- add verification by fetching the payment from Moyasar using `MOYASAR_SECRET_KEY`
- before marking paid, validate all of:
  - payment exists in Moyasar
  - status is one of the accepted success states
  - amount matches the stored initiated row
  - currency matches
  - plan metadata matches expected plan
  - host_id matches the stored initiated row

Frontend changes:
- `PaymentService.handlePaymentCallback` stops calling `update_payment_status`
- replace it with a new authenticated edge function, `confirm-payment-callback`, which:
  - receives the payment ID
  - verifies against Moyasar server-side
  - updates the DB server-side
  - returns only final status and message

### 8. Admin LLM function deployment
The repo expects `generate-content`, but the linked project currently has no deployed functions.

Required actions:
- deploy `generate-content`
- configure required secrets:
  - `GEMINI_API_KEY`
  - `GROQ_API_KEY` if fallback is retained
  - `LLM_PRIMARY_PROVIDER`
- verify admin JWT enforcement works in production after deployment

## Client Changes

### Shared package
Update these services/stores to use the new RPCs and persist `playerToken`:
- `packages/shared/src/services/GameService.ts`
- `packages/shared/src/services/RoundService.ts`
- `packages/shared/src/stores/gameStore.ts`
- `packages/shared/src/utils/sessionStorage.ts`

Session storage payload must add:
- `playerToken`

Remove direct writes from client code:
- `.from('players').insert/update`
- `.from('game_rounds').insert/update`
- `.from('player_answers').insert`
- `.from('votes').insert/upsert`
- `.from('game_category_prompts').upsert`
- direct payment-status RPC calls

### Web and mobile
Required behavior changes:
- `joinGame` stores `playerToken`
- page refresh / app relaunch uses `reconnect_player_session`
- round start uses `create_round`
- answer submit uses `submit_answer`
- vote submit uses token-verified `cast_vote`
- controller actions use token-verified start/advance/claim/promote/category RPCs
- display mode no longer writes gameplay state directly

Display mode decision:
- remove `startGameFromDisplay` direct `games` update path
- display mode becomes observational only
- the first connected controller-capable player starts the game

## Migration Sequence
1. Re-baseline the live schema and reconcile migration history.
2. Add new player token columns and helper functions.
3. Add new secure RPCs without removing old ones yet.
4. Update web/mobile/shared clients to use only the new RPCs.
5. Deploy `moyasar-webhook`, `generate-content`, and the new `confirm-payment-callback` function.
6. Revoke execute on public payment mutation functions.
7. Remove public write policies from gameplay tables.
8. Remove old insecure RPC signatures or revoke public execute from them.
9. Remove dead fallback paths from client code.

Cutover rule:
- perform the revoke/removal steps during a maintenance window after deploying updated clients
- do not leave mixed old/new public mutation paths active longer than one release cycle

## Acceptance Tests

### Security tests
- Public signup cannot update `host_profiles.is_admin`, `is_approved`, `is_paid_host`, `subscription_tier`, or `is_banned`.
- Anonymous client cannot update another player's `score` or `connection_status`.
- Anonymous client cannot create or update `game_rounds`.
- Anonymous client cannot insert `player_answers` or `votes` directly.
- Anonymous client cannot call controller RPCs with another player's UUID and no valid token.
- Anonymous client cannot write `game_category_prompts`.
- Anonymous or authenticated client cannot call `update_payment_status`.
- Fake payment IDs cannot upgrade a host account.
- `supabase migration list` for the linked project matches the intended deployed schema history.

### Gameplay tests
- A valid player token can answer only once per round and only before deadline.
- A valid player token can vote only for eligible answers and only before deadline.
- A non-controller token cannot start, advance, or change the category prompt.
- A stale second `force_advance_round` call does not skip voting.
- Captain failover only occurs when the target captain is truly disconnected or stale.
- Refresh/reconnect with the correct token restores the same player seat.
- Refresh without the token cannot hijack an existing disconnected seat.

### Ban tests
- Banned host cannot create a game.
- Banned host cannot access admin.
- Banned host cannot complete payment confirmation to regain entitlement.

### Deployment tests
- `generate-content` returns non-404 and enforces admin auth.
- `moyasar-webhook` returns non-404 and rejects invalid payload verification.
- no required production feature depends on an undeployed Edge Function.

## Deliverables
- Supabase migration set implementing the schema, policy, revoke, and RPC changes
- shared/web/mobile client updates to consume the new secure RPCs
- payment callback flow moved fully server-side
- automated regression tests for the security and gameplay scenarios above
