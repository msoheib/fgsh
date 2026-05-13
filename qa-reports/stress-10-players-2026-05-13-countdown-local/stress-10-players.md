# 10-Player Stress Test Report

- Status: **FAIL**
- Target URL: http://127.0.0.1:5184
- Started: 2026-05-13T17:43:50.894Z
- Completed: 2026-05-13T17:44:45.883Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 10 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: 4F1QV5

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room 4F1QV5. |
| 10 players join successfully | PASS | 10 players joined isolated browser contexts. |
| TV lobby displays 10 / 10 players | PASS | TV lobby displayed 10 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 10 answers confirm | PASS | All 10 player answer confirmations completed. |
| Voting opens promptly after answer quorum | PASS | Voting opened 2980 ms after the last answer confirmation. |
| Voting opens for all players | PASS | Voting options appeared for all 10 players. |
| All 10 votes confirm | PASS | All 10 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No unexpected TV category-selection flash after answering begins | PASS | No TV category-selection wait screen was observed after answering began. |
| No relevant framework/runtime errors | FAIL | 3 relevant diagnostic records were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 11064 | PASS | Created TV room 4F1QV5. |
| join | Stress P01 | 2357 | PASS |  |
| join | Stress P10 | 3126 | PASS |  |
| join | Stress P08 | 3232 | PASS |  |
| join | Stress P04 | 3261 | PASS |  |
| join | Stress P02 | 3278 | PASS |  |
| join | Stress P03 | 3545 | PASS |  |
| join | Stress P07 | 3546 | PASS |  |
| join | Stress P05 | 3620 | PASS |  |
| join | Stress P09 | 3873 | PASS |  |
| join | Stress P06 | 3901 | PASS |  |
| start game | Stress P01 | 25813 | PASS |  |
| answer | Stress P08 | 222 | PASS |  |
| answer | Stress P03 | 340 | PASS |  |
| answer | Stress P02 | 341 | PASS |  |
| answer | Stress P09 | 337 | PASS |  |
| answer | Stress P06 | 341 | PASS |  |
| answer | Stress P01 | 347 | PASS |  |
| answer | Stress P05 | 344 | PASS |  |
| answer | Stress P04 | 346 | PASS |  |
| answer | Stress P07 | 344 | PASS |  |
| answer | Stress P10 | 342 | PASS |  |
| answer quorum -> voting | all | 2980 | PASS | 2980 ms after the last answer confirmation. |
| vote | Stress P05 | 3185 | PASS |  |
| vote | Stress P01 | 3417 | PASS |  |
| vote | Stress P06 | 3415 | PASS |  |
| vote | Stress P04 | 3418 | PASS |  |
| vote | Stress P07 | 3416 | PASS |  |
| vote | Stress P02 | 3424 | PASS |  |
| vote | Stress P09 | 3418 | PASS |  |
| vote | Stress P03 | 3425 | PASS |  |
| vote | Stress P10 | 4429 | PASS |  |
| vote | Stress P08 | 4432 | PASS |  |
| total | all | 54741 | FAIL |  |
| total | all | 54988 | FAIL | stress-test acceptance status<br><br>[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m<br><br>Expected: [32m"pass"[39m<br>Received: [31m"fail"[39m |

## Diagnostics

- Console/page/request records captured: 296
- Relevant error records: 3

| Source | Type | Status | URL | Message |
| --- | --- | ---: | --- | --- |
| TV/host | requestfailed |  | https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap | net::ERR_ABORTED |
| TV/host | console |  | http://127.0.0.1:5184/create | [error] Failed to load resource: the server responded with a status of 404 (Not Found) |
| TV/host | console |  | http://127.0.0.1:5184/tv/game | [error] Failed to load resource: the server responded with a status of 404 (Not Found) |


## Failure / Blockers

- stress-test acceptance status

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m"pass"[39m
Received: [31m"fail"[39m

## Screenshots

TV lobby with 10 players

![TV lobby with 10 players](screenshots/01-tv-lobby-10-players.png)

TV answering state

![TV answering state](screenshots/02-tv-answering.png)

Player answering state

![Player answering state](screenshots/03-player-answering.png)

TV voting state

![TV voting state](screenshots/04-tv-voting.png)

Player voting state

![Player voting state](screenshots/05-player-voting.png)

TV completed/reveal state

![TV completed/reveal state](screenshots/06-tv-completed-or-reveal.png)

Player completed state

![Player completed state](screenshots/07-player-completed.png)

Failure state - TV/host

![Failure state - TV/host](screenshots/failure-tv-host.png)

Failure state - Stress P01

![Failure state - Stress P01](screenshots/failure-stress-p01.png)

Failure state - Stress P02

![Failure state - Stress P02](screenshots/failure-stress-p02.png)
