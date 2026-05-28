# Live Regression Battery Report

- Status: **FAIL**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-05-28T18:10:03.328Z
- Completed: 2026-05-28T18:22:21.809Z
- Credentials: supplied through environment variables and intentionally not logged.

## Cases

| Case | Status | Duration ms | Details |
| --- | --- | ---: | --- |
| Deterministic vote registration and scoring | PASS | 26650 | All 3 votes persisted exactly once and scores matched expected totals (VoteScore P01:500, VoteScore P02:500, VoteScore P03:1000). |
| Near-timeout selected vote must persist or clear cleanly | FAIL | 72748 | Reproduced vote UI mismatch: answer was visibly selected near timer zero, but no vote row persisted. |
| Answer timer reaches zero with active controller | PASS | 86931 | Answer timer reached zero with active controller and advanced to voting. |
| Answer timer reaches zero with frozen controller | PASS | 87416 | Frozen controller did not stall answer timer; round advanced to voting. |
| Answer timer with controller force-advance RPC blocked | FAIL | 87080 | Reproduced timer dependency: controller stayed connected but its force-advance RPC was blocked, another player was active, and the round remained answering after deadline. |
| Voting timer reaches zero with active controller | PASS | 74573 | Voting timer reached zero with active controller and advanced to completed. |
| Play Again leaver can rejoin same lobby | FAIL | 282692 | Reproduced Play Again leaver rejoin failure. Saved session present after leave: true. URL: https://fgsh-web.vercel.app/join?code=L8A9NX. Text: انضم إلى اللعبة<br>الكود: L8A9NX<br>أدخل اسمك<br>الاسم مستخدم بالفعل<br>بدأ اللعبة<br>العودة |
| Long question and answer text does not overlap or clip | FAIL | 20023 | Mobile answer overflow/clipping detected (button1 scroll=547x48 client=288x48; button2 scroll=547x48 client=288x48) |

## Diagnostics

- Console/page/request records captured: 152
- Relevant error records: 8

| Source | Type | Status | URL | Message |
| --- | --- | ---: | --- | --- |
| BlockedTimer P01 | requestfailed |  | https://yabticelgerjwzrhyaye.supabase.co/rest/v1/rpc/force_advance_round_as_player | net::ERR_FAILED |
| BlockedTimer P01 | console |  | https://fgsh-web.vercel.app/game | [error] Failed to load resource: net::ERR_FAILED |
| BlockedTimer P01 | console |  | https://fgsh-web.vercel.app/game | [error] Error calling force_advance_round: GameError: TypeError: Failed to fetch<br>    at gt.forceAdvanceRound (https://fgsh-web.vercel.app/assets/index-f3ef173f.js:285:47934)<br>    at async https://fgsh-web.vercel.app/assets/index-f3ef173f.js:374:37540 |
| Replay P02 | requestfailed |  | https://yabticelgerjwzrhyaye.supabase.co/rest/v1/games?select=*&id=eq.e094a7ec-f2de-47d6-9783-d36543008635 | net::ERR_ABORTED |
| Replay P02 | requestfailed |  | https://yabticelgerjwzrhyaye.supabase.co/rest/v1/rpc/reconnect_player_session | net::ERR_ABORTED |
| Replay P02 | console |  | https://fgsh-web.vercel.app/ | [error] [rehydrate] Failed to reconnect player: GameError: TypeError: Failed to fetch<br>    at gt.reconnectPlayerSession (https://fgsh-web.vercel.app/assets/index-f3ef173f.js:285:47150)<br>    at async rehydrateSession (https://fgsh-web.vercel.app/assets/index-f3ef173f.js:301:29507) |
| Replay P02 | console |  | https://fgsh-web.vercel.app/join?code=L8A9NX | [error] Failed to load resource: the server responded with a status of 400 () |
| Replay P02 | console |  | https://fgsh-web.vercel.app/join?code=L8A9NX | [error] Failed to join game: GameError: الاسم مستخدم بالفعل<br>    at gt.joinGame (https://fgsh-web.vercel.app/assets/index-f3ef173f.js:285:44259)<br>    at async joinGame (https://fgsh-web.vercel.app/assets/index-f3ef173f.js:301:17010)<br>    at async f (https://fgsh-web.vercel.app/assets/index-f3ef173f.js:374:10025) |


## Blockers / Failures

- Near-timeout selected vote must persist or clear cleanly: Reproduced vote UI mismatch: answer was visibly selected near timer zero, but no vote row persisted.
- Answer timer with controller force-advance RPC blocked: Reproduced timer dependency: controller stayed connected but its force-advance RPC was blocked, another player was active, and the round remained answering after deadline.
- Play Again leaver can rejoin same lobby: Reproduced Play Again leaver rejoin failure. Saved session present after leave: true. URL: https://fgsh-web.vercel.app/join?code=L8A9NX. Text: انضم إلى اللعبة
الكود: L8A9NX
أدخل اسمك
الاسم مستخدم بالفعل
بدأ اللعبة
العودة
- Long question and answer text does not overlap or clip: Mobile answer overflow/clipping detected (button1 scroll=547x48 client=288x48; button2 scroll=547x48 client=288x48)

## Screenshots

Deterministic vote scoring reveal

![Deterministic vote scoring reveal](screenshots/vote-score-reveal.png)

Late vote selected before confirmation timeout

![Late vote selected before confirmation timeout](screenshots/late-vote-selected.png)

Active controller answer timer after zero

![Active controller answer timer after zero](screenshots/active-answer-timeout-controller.png)

Frozen controller answer timer after zero

![Frozen controller answer timer after zero](screenshots/frozen-controller-answer-timeout-noncontroller.png)

Blocked controller force-advance after answer timer zero

![Blocked controller force-advance after answer timer zero](screenshots/blocked-controller-force-advance.png)

Active controller voting timer after zero

![Active controller voting timer after zero](screenshots/active-voting-timeout-controller.png)

Replay case final round completed

![Replay case final round completed](screenshots/play-again-final-round-completed.png)

Play Again leaver after pressing leave

![Play Again leaver after pressing leave](screenshots/play-again-leaver-after-leave.png)

Long TV question layout

![Long TV question layout](screenshots/long-tv-question-layout.png)

Long mobile voting answer layout

![Long mobile voting answer layout](screenshots/long-mobile-answer-layout.png)
