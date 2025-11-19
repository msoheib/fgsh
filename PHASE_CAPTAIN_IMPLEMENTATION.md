# Phase Captain Pattern Implementation

## Overview

Implemented the **Phase Captain Pattern** with automatic host failover to address the architectural concern about moving phase completion checks to a durable place. This pattern ensures that phase transitions (answering → voting → next round) continue to work even if the original host disconnects.

## Architecture

### Core Concept
- **Phase Captain**: A designated player responsible for triggering phase transitions
- **Default**: Host player starts as phase captain
- **Failover**: Automatic promotion of new captain if current captain disconnects
- **Resilience**: Game continues seamlessly without original host

### Why This Approach?
✅ No Supabase edge functions/stored procedures needed (as requested)
✅ Client-driven architecture with failover resilience
✅ Minimal changes to existing codebase
✅ Clear separation of responsibilities

## Implementation Details

### 1. Database Schema (`supabase/migrations/add_phase_captain.sql`)

```sql
-- Add phase_captain_id to games table
ALTER TABLE games
ADD COLUMN phase_captain_id UUID REFERENCES players(id) ON DELETE SET NULL;

-- Set default to host for existing games
UPDATE games
SET phase_captain_id = host_player_id
WHERE phase_captain_id IS NULL;

-- Index for performance
CREATE INDEX idx_games_phase_captain ON games(phase_captain_id);
```

**Migration Status**: ⏳ Needs to be applied in Supabase Dashboard

### 2. TypeScript Types (`packages/shared/src/types/index.ts`)

Added `phase_captain_id` field to `Game` interface:

```typescript
export interface Game {
  id: string;
  code: string;
  host_id: string | null;
  phase_captain_id: string | null; // New field
  status: GameStatus;
  // ... other fields
}
```

### 3. Game Service (`packages/shared/src/services/GameService.ts`)

Updated `createGame()` to set phase captain:

```typescript
// Update game with host_id and phase_captain_id (host starts as captain)
await supabase
  .from('games')
  .update({ host_id: player.id, phase_captain_id: player.id })
  .eq('id', game.id);
```

### 4. Game Store (`packages/shared/src/stores/gameStore.ts`)

**Added State**:
- `isPhaseCaptain: boolean` - Tracks if current player is the phase captain

**Added Methods**:
- `promoteNewCaptain(disconnectedPlayerId)` - Handles captain failover

**Updated Logic**:
- `onGameUpdated`: Updates `isPhaseCaptain` when `phase_captain_id` changes
- `onPlayerLeft`: Triggers captain promotion if captain disconnects
- `createGame`: Sets `isPhaseCaptain: true` for host
- `joinGame`: Calculates `isPhaseCaptain` based on `game.phase_captain_id`

**Captain Promotion Algorithm**:
```typescript
promoteNewCaptain: async (disconnectedPlayerId: string) => {
  // Find next available player (prefer host, then first remaining player)
  const remainingPlayers = players.filter(p => p.id !== disconnectedPlayerId);
  const newCaptain = remainingPlayers.find(p => p.is_host) || remainingPlayers[0];

  if (!newCaptain) return; // No players left

  // Update database
  await supabase
    .from('games')
    .update({ phase_captain_id: newCaptain.id })
    .eq('id', game.id);

  // Update local state
  set({ game: { ...game, phase_captain_id: newCaptain.id }, isPhaseCaptain });
}
```

### 5. Game UI (`packages/web/src/pages/Game.tsx`)

**Updated Phase Transition Checks**:
- Changed all `isHost` checks to `isPhaseCaptain` in phase transition logic
- Round initialization: Only phase captain creates rounds
- Answer phase completion: Only phase captain triggers voting
- Voting phase completion: Only phase captain ends rounds

**Visual Indicator**:
Added phase captain badge at the top of the game screen:

```tsx
{isPhaseCaptain && (
  <div className="mt-2 text-center">
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                     bg-gradient-to-r from-secondary-main/30 to-secondary-light/30
                     border border-secondary-main/50 text-xs sm:text-sm">
      <span className="text-secondary-main">👑</span>
      <span>أنت قائد اللعبة</span>
    </span>
  </div>
)}
```

## Game Flow with Phase Captain

### Normal Flow (Host is Captain)
1. **Game Start**: Host creates game → becomes phase captain
2. **Round Start**: Captain creates round → all players receive via Realtime
3. **Answer Phase**:
   - All players submit answers
   - Captain monitors completion
   - Captain triggers voting when all answered OR timer expires
4. **Voting Phase**:
   - All players vote
   - Captain monitors completion
   - Captain ends round when all voted OR timer expires
5. **Next Round**: Captain increments round → repeat from step 2

### Failover Flow (Captain Disconnects)
1. **Captain Disconnects**: `onPlayerLeft` detects captain is gone
2. **Automatic Promotion**:
   - System finds new captain (prefer host, then first available player)
   - Updates database `phase_captain_id`
   - Realtime broadcasts change to all clients
3. **New Captain Takes Over**:
   - New captain's `isPhaseCaptain` becomes `true`
   - Phase transition hooks activate on new captain's client
   - Game continues seamlessly from current state
4. **Visual Update**: New captain sees "👑 أنت قائد اللعبة" badge

## Testing Scenarios

### Scenario 1: Normal Game (No Disconnection)
1. Host creates game with 2 players
2. Host starts game
3. Verify host has captain badge
4. Complete round 1 (answering → voting → next round)
5. Verify transitions work correctly

### Scenario 2: Host Disconnects Mid-Game
1. Host creates game with 3 players (Host, Player A, Player B)
2. Host starts game
3. During round 1 answering phase, host disconnects
4. **Expected**: Player A (first remaining) becomes captain
5. Verify Player A can trigger voting phase
6. Complete game with Player A as captain

### Scenario 3: Captain Failover Chain
1. Host creates game with 3 players
2. Host disconnects → Player A becomes captain
3. Player A disconnects → Player B becomes captain
4. Verify Player B can complete game

### Scenario 4: Mid-Game Join
1. Game in progress with current captain
2. New player joins mid-round
3. **Expected**: New player sees game state correctly
4. Verify new player is NOT captain (unless all others disconnect)

## Migration Checklist

### Required Database Changes
- [ ] Run `add_timer_trigger.sql` migration (from previous fix)
- [ ] Run `add_phase_captain.sql` migration (new)

### Verification Steps
1. [ ] Check `games` table has `phase_captain_id` column
2. [ ] Verify trigger `set_timer_on_voting` exists
3. [ ] Create test game and verify captain badge shows for host
4. [ ] Test captain failover by disconnecting host

## Benefits

✅ **Resilience**: Game survives host disconnection
✅ **Automatic**: No manual intervention needed
✅ **Transparent**: Players see who is captain
✅ **Scalable**: Works with any number of players
✅ **Simple**: Client-side pattern, no complex server logic

## Comparison with Alternative Approaches

### Server-Side Triggers/Functions
❌ User requested avoiding Supabase edge functions/stored procedures
❌ More complex to implement and debug
❌ Harder to customize game logic

### Phase Captain Pattern (Implemented)
✅ Client-driven with automatic failover
✅ No additional server infrastructure
✅ Easy to extend and customize
✅ Clear ownership of phase transitions

## Next Steps

1. **Apply Migrations**: Run both SQL migrations in Supabase Dashboard
2. **Test Thoroughly**: Verify all scenarios work correctly
3. **Monitor Logs**: Check console for captain promotion messages
4. **Performance**: Monitor phase transition timing in production

## Console Log Markers

Look for these logs to track captain behavior:

```
🎯 Phase captain status: { isPhaseCaptain: true, ... }
👑 Promoting player to phase captain: [player name]
⚠️ Phase captain disconnected, promoting new captain...
✅ New phase captain promoted: { newCaptainId: ... }
🎮 Phase captain creating round [number]
📊 Phase captain starting voting phase...
🗳️ Phase captain ending round...
```

## Known Limitations

1. **Race Conditions**: If multiple captains disconnect rapidly, there's a small window where duplicate promotions could occur
2. **Network Latency**: Captain promotion depends on Realtime event delivery
3. **Single Point**: Only one captain at a time, no distributed consensus

## Future Enhancements (Optional)

- **Captain Election**: Implement voting to elect new captain instead of automatic promotion
- **Captain Rotation**: Rotate captain role each round for fairness
- **Performance Metrics**: Track captain response times and switch if too slow
- **Backup Captain**: Pre-designate a backup to reduce failover time
