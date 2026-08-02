# Live Regression Battery Report

- Status: **FAIL**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-05-29T02:25:02.741Z
- Completed: 2026-05-29T02:37:02.689Z
- Credentials: supplied through environment variables and intentionally not logged.

## Cases

| Case | Status | Duration ms | Details |
| --- | --- | ---: | --- |
| Deterministic vote registration and scoring | PASS | 20999 | All 3 votes persisted exactly once and scores matched expected totals (VoteScore P01:500, VoteScore P03:1000, VoteScore P02:500). |
| Near-timeout selected vote must persist or clear cleanly | PASS | 66956 | No late vote persisted and no selected UI state was observed. |
| Answer timer reaches zero with active controller | PASS | 86297 | Answer timer reached zero with active controller and advanced to voting. |
| Answer timer reaches zero with frozen controller | PASS | 85775 | Frozen controller did not stall answer timer; round advanced to voting. |
| Answer timer with controller force-advance RPC blocked | PASS | 86653 | Blocked controller force-advance did not stall the timer; round advanced to voting. |
| Voting timer reaches zero with active controller | PASS | 73315 | Voting timer reached zero with active controller and advanced to completed. |
| Play Again leaver can rejoin same lobby | FAIL | 282588 | Reproduced Play Again leaver rejoin failure. Saved session present after leave: false. URL: https://fgsh-web.vercel.app/join?code=MWMZ5N. Text: انضم إلى اللعبة<br>الكود: MWMZ5N<br>أدخل اسمك<br>الاسم مستخدم بالفعل<br>بدأ اللعبة<br>العودة |
| Long question and answer text does not overlap or clip | FAIL | 17144 | Mobile answer overflow/clipping detected (button1 scroll=547x48 client=288x48; button2 scroll=547x48 client=288x48) |

## Diagnostics

- Console/page/request records captured: 145
- Relevant error records: 5

| Source | Type | Status | URL | Message |
| --- | --- | ---: | --- | --- |
| BlockedTimer P01 | requestfailed |  | https://yabticelgerjwzrhyaye.supabase.co/rest/v1/rpc/force_advance_round_as_player | net::ERR_FAILED |
| BlockedTimer P01 | console |  | https://fgsh-web.vercel.app/game | [error] Failed to load resource: net::ERR_FAILED |
| BlockedTimer P01 | console |  | https://fgsh-web.vercel.app/game | [error] Error calling force_advance_round: GameError: TypeError: Failed to fetch<br>    at vt.forceAdvanceRound (https://fgsh-web.vercel.app/assets/index-b14bacc7.js:285:47934)<br>    at async ne (https://fgsh-web.vercel.app/assets/index-b14bacc7.js:374:37700) |
| Replay P02 | console |  | https://fgsh-web.vercel.app/join?code=MWMZ5N | [error] Failed to load resource: the server responded with a status of 400 () |
| Replay P02 | console |  | https://fgsh-web.vercel.app/join?code=MWMZ5N | [error] Failed to join game: GameError: الاسم مستخدم بالفعل<br>    at vt.joinGame (https://fgsh-web.vercel.app/assets/index-b14bacc7.js:285:44259)<br>    at async joinGame (https://fgsh-web.vercel.app/assets/index-b14bacc7.js:301:17010)<br>    at async m (https://fgsh-web.vercel.app/assets/index-b14bacc7.js:374:10025) |


## Blockers / Failures

- Play Again leaver can rejoin same lobby: Reproduced Play Again leaver rejoin failure. Saved session present after leave: false. URL: https://fgsh-web.vercel.app/join?code=MWMZ5N. Text: انضم إلى اللعبة
الكود: MWMZ5N
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
