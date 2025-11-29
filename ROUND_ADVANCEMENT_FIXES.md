# Round Advancement Fixes - Mobile App

## Issues Fixed

### 1. "Next Round" Button Not Working
**Problem**: ResultsScreen's "Next Question" button was a stub that only logged to console.

**Solution**:
- Imported `GameService` from shared package
- Implemented proper `handleNextQuestion` function that calls `GameService.incrementRound(game.id)`
- Added guards to only allow phase captain or host to advance rounds
- Shows waiting message for non-host players
- Shows "Game finished" message when game is complete

**Files Modified**: `packages/mobile/src/screens/ResultsScreen.tsx`

### 2. Timer Expiration Not Advancing Rounds
**Problem**: Mobile GameScreen didn't handle timer expiration, so rounds would get stuck when timer reached 0.

**Solution**: Added timer expiration handler (matching web version):
- Calls `force_advance_round` RPC when `timeRemaining` hits 0
- 500ms delay to prevent multiple rapid calls
- Proper error handling and logging
- Server processes the advancement via database triggers

**Files Modified**: `packages/mobile/src/screens/GameScreen.tsx` (lines 214-243)

## Code Changes

### ResultsScreen.tsx

**Imports**:
```typescript
import { useGameStore, GameService } from '@fakash/shared';
```

**Store Values**:
```typescript
const { game, players, isPhaseCaptain, isHost } = useGameStore();
```

**Logic**:
```typescript
const isGameFinished = game.status === 'finished';
const canAdvanceRound = (isPhaseCaptain || isHost) && !isGameFinished;

const handleNextQuestion = async () => {
  if (!game || !canAdvanceRound) return;

  try {
    console.log('📢 Advancing to next round...');
    await GameService.incrementRound(game.id);
  } catch (err) {
    console.error('❌ Failed to advance round:', err);
  }
};
```

**UI**:
```typescript
{canAdvanceRound ? (
  <TouchableOpacity style={styles.nextButton} onPress={handleNextQuestion}>
    <Text style={styles.nextButtonText}>السؤال التالي</Text>
  </TouchableOpacity>
) : (
  <View style={styles.waitingContainer}>
    <Text style={styles.waitingText}>
      {isGameFinished
        ? 'انتهت اللعبة!'
        : 'في انتظار المضيف للسؤال التالي...'}
    </Text>
  </View>
)}
```

### GameScreen.tsx

**Timer Expiration Handler**:
```typescript
// Handle timer expiration - call server-side force_advance_round
useEffect(() => {
  if (!currentRound || timeRemaining !== 0) {
    return;
  }

  const handleTimerExpired = async () => {
    console.log('⏰ Timer expired! Calling server-side force_advance_round...');
    try {
      const { getSupabase } = await import('@fakash/shared');
      const supabase = getSupabase();

      const { error } = await supabase.rpc('force_advance_round', {
        p_round_id: currentRound.id
      });

      if (error) {
        console.error('❌ Failed to force advance round:', error);
      } else {
        console.log('✅ Server processing timer expiration');
      }
    } catch (err) {
      console.error('❌ Error calling force_advance_round:', err);
    }
  };

  // Small delay to prevent multiple rapid calls
  const timer = setTimeout(handleTimerExpired, 500);
  return () => clearTimeout(timer);
}, [currentRound, timeRemaining]);
```

## How It Works

### Manual Advancement (Results Screen)
1. Phase captain or host sees "Next Question" button
2. Other players see "Waiting for host..." message
3. When button pressed, calls `GameService.incrementRound(game.id)`
4. Server updates game state via database
5. Realtime subscription broadcasts update to all clients
6. All clients navigate to next round automatically

### Automatic Advancement (Timer Expiration)
1. Timer counts down from server timestamp
2. When `timeRemaining` reaches 0, useEffect triggers
3. Calls `force_advance_round` RPC on server
4. Server marks round as completed and advances phase
5. Database triggers handle score calculation
6. Realtime updates all clients

## Testing Checklist

### Manual Advancement
- [ ] Phase captain/host sees "Next Question" button on results screen
- [ ] Non-captain players see waiting message
- [ ] Button advances to next round when clicked
- [ ] All players see new round after advancement
- [ ] Game finished message shows after last round

### Automatic Advancement
- [ ] Timer expires during answering phase
- [ ] Round automatically advances to voting phase
- [ ] Timer expires during voting phase
- [ ] Round automatically advances to completed/results
- [ ] Console shows "Timer expired!" message
- [ ] Console shows "Server processing timer expiration" message

### Edge Cases
- [ ] Multiple clients calling force_advance_round simultaneously (should be idempotent)
- [ ] Phase captain leaves mid-game (new captain should be promoted)
- [ ] Network interruption during advancement (should recover via Realtime)
- [ ] Last round completion (should mark game as finished)

## Debug Console Logs

Look for these messages to verify functionality:

### ResultsScreen
- `📢 Advancing to next round...` - Button pressed
- `❌ Failed to advance round:` - Error occurred

### GameScreen
- `⏰ Timer expired! Calling server-side force_advance_round...` - Timer hit 0
- `✅ Server processing timer expiration` - RPC succeeded
- `❌ Failed to force advance round:` - RPC failed
- `❌ Error calling force_advance_round:` - Exception occurred

## Dependencies

- `GameService.incrementRound(gameId)` - Shared package
- `getSupabase()` - Shared package
- `isPhaseCaptain`, `isHost` - Game store flags
- `force_advance_round` RPC - Supabase function

## Related Files

- `packages/shared/src/services/GameService.ts` - incrementRound implementation
- `packages/shared/src/stores/gameStore.ts` - isPhaseCaptain/isHost flags
- `supabase/migrations/add_server_side_phase_transitions.sql` - force_advance_round RPC
