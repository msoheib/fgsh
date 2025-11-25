# Vercel Build TypeScript Fixes

## ✅ Completed Fixes

1. ✅ Added `@types/node` to `packages/shared/package.json`
2. ✅ Added `"types": ["node"]` to `packages/shared/tsconfig.json`
3. ✅ Changed `NodeJS.Timeout` to `ReturnType<typeof setTimeout>` in:
   - `packages/shared/src/services/RealtimeService.ts:49`
   - `packages/shared/src/stores/gameStore.ts:22`
4. ✅ Added `onVotingStarted?: (answers: PlayerAnswer[]) => void;` to GameEventCallbacks
5. ✅ Fixed `session.joinedAt` nullability in `sessionStorage.ts`

## 🔧 Remaining Critical Fixes

### 1. Fix gameStore.ts - null playerId check (Line ~572-579)

**File**: `packages/shared/src/stores/gameStore.ts`

**Issue**: Calling `updatePlayerStatus` with potentially null `playerId` in display mode

**Fix**:
```typescript
const oldSession = getGameSession();
if (oldSession && oldSession.playerId) {  // Add null check here
  try {
    await GameService.updatePlayerStatus(oldSession.playerId, 'disconnected');
  } catch (error) {
    // ...
  }
}
```

### 2. Fix scoring.ts - null player_id handling (Line ~22-54)

**File**: `packages/shared/src/utils/scoring.ts`

**Issue**: System-inserted correct answers have `player_id = null`, but code pushes directly to scores

**Fix**:
```typescript
if (answer.is_correct) {
  // ...
} else {
  // Skip system answers (player_id = null)
  if (answer.player_id === null) continue;

  scores.push({
    player_id: answer.player_id,
    // ...
  });
}
```

### 3. Fix RoundService.ts - remove unused correctAnswer parameter (Line ~84-114)

**File**: `packages/shared/src/services/RoundService.ts`

**Issue**: `correctAnswer` parameter is declared but never used

**Fix Option 1 - Remove parameter**:
```typescript
static async submitAnswer(
  roundId: string,
  playerId: string,
  answerText: string
  // Remove: correctAnswer: string
): Promise<PlayerAnswer> {
```

**Fix Option 2 - Use the parameter**:
```typescript
// If you need it for validation, use it:
if (!correctAnswer || answerText === correctAnswer) {
  throw new Error('Answer cannot match correct answer');
}
```

### 4. Fix validation.ts - roundCount type mismatch (Line ~45-63)

**File**: `packages/shared/src/utils/validation.ts`

**Issue**: `roundCount` should be literal union type to work with `includes()`

**Fix**:
```typescript
export function validateGameSettings(settings: {
  roundCount: typeof GAME_CONFIG.ROUND_OPTIONS[number];  // Change from: number
  maxPlayers: number;
}): void {
  if (
    !GAME_CONFIG.ROUND_OPTIONS.includes(settings.roundCount) ||
    settings.roundCount < GAME_CONFIG.MIN_ROUNDS ||
    settings.roundCount > GAME_CONFIG.MAX_ROUNDS
  ) {
    throw new Error(
      `Round count must be one of: ${GAME_CONFIG.ROUND_OPTIONS.join(', ')}`
    );
  }
  // ...
}
```

## 🧹 Web Package - Remove Unused Imports/Variables

### packages/web/src/pages/Game.tsx

**Remove unused imports**:
```typescript
// Remove: import React from 'react';  // Not needed with new JSX transform
import { useEffect, useState } from 'react';  // Keep this
```

**Fix myAnswer unused variable** (find where it's declared and either use it or remove):
```typescript
// Either remove if not needed:
// const myAnswer = useRoundStore((state) => state.myAnswer);

// Or use it in your JSX
```

### packages/web/src/components/PlanCard.tsx

**Remove unused import**:
```typescript
// Remove: import { formatPrice } from '@fakash/shared';
// Keep only: import { type PaymentPlan } from '@fakash/shared';
```

### packages/web/src/components/UpgradeModal.tsx

**Remove unused import**:
```typescript
// Remove: import { GradientButton } from '../GradientButton';
// Or use it if you need a gradient button
```

### packages/web/src/pages/PaymentCallback.tsx

**Remove unused variable**:
```typescript
// Line ~40: Remove planId if not used:
const { subscription, status } = location.state || {};  // Remove planId
```

## 🔍 Additional Nullability Fixes

### GameDeepLink.tsx

**Issue**: Dereferencing `session.gameCode` without ensuring session exists

**Fix**:
```typescript
const session = getGameSession();
if (!session || !session.gameCode) {
  // Handle missing session
  return;
}
// Now safe to use session.gameCode
```

### Game.tsx - selectedAnswer type narrowing

**Issue**: `selectedAnswer` is `string | null` but passed to methods expecting `string`

**Fix**:
```typescript
const handleSubmitVote = async () => {
  if (!selectedAnswer) {  // Add null check
    return;
  }
  await submitVote(currentPlayer.id, selectedAnswer);  // Now type-safe
};
```

### Profile.tsx - PaymentHistory type mismatch

**Issue**: `paid_at` type mismatch between `PaymentService` and `Profile`

**Fix**:
```typescript
const paymentHistory = await PaymentService.getPaymentHistory();
const normalizedPayments = paymentHistory.map(payment => ({
  ...payment,
  paid_at: payment.paid_at ?? null  // Normalize undefined to null
}));
setPayments(normalizedPayments);
```

## 📝 Quick Fix Script

Run this command to check for TypeScript errors:

```bash
cd packages/shared && npm run type-check
cd ../web && npm run type-check
```

## 🚀 Deployment Checklist

- [ ] All TypeScript errors resolved in `packages/shared`
- [ ] All TypeScript errors resolved in `packages/web`
- [ ] Run `npm run type-check` in both packages successfully
- [ ] Test build locally: `cd packages/web && npm run build`
- [ ] Push changes to trigger Vercel build
- [ ] Monitor Vercel build logs for any remaining issues

## 🎯 Priority Order

1. **HIGH**: Fix nullability issues (gameStore, scoring, validation)
2. **HIGH**: Remove unused parameters (RoundService)
3. **MEDIUM**: Remove unused imports/variables (web package)
4. **LOW**: Additional type narrowing improvements

---

**Note**: After making these changes, run `npm run type-check` in both `packages/shared` and `packages/web` to verify all issues are resolved before pushing to Vercel.
