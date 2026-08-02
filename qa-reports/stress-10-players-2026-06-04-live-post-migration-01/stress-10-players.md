# 10-Player Stress Test Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-06-04T13:00:13.916Z
- Completed: 2026-06-04T13:01:00.405Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 10 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: 5HR4SX

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room 5HR4SX. |
| 10 players join successfully | PASS | 10 players joined isolated browser contexts. |
| TV lobby displays 10 / 10 players | PASS | TV lobby displayed 10 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 10 answers confirm | PASS | All 10 player answer confirmations completed. |
| Voting opens promptly after answer quorum | PASS | Voting opened 2956 ms after the last answer confirmation. |
| Voting opens for all players | PASS | Voting options appeared for all 10 players. |
| All 10 votes confirm | PASS | All 10 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No unexpected TV category-selection flash after answering begins | PASS | No TV category-selection wait screen was observed after answering began. |
| No relevant framework/runtime errors | PASS | No relevant runtime, page, request, or HTTP 5xx errors were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 3900 | PASS | Created TV room 5HR4SX. |
| join | Stress P01 | 3614 | PASS |  |
| join | Stress P10 | 2837 | PASS |  |
| join | Stress P04 | 3064 | PASS |  |
| join | Stress P02 | 3142 | PASS |  |
| join | Stress P07 | 3388 | PASS |  |
| join | Stress P09 | 3399 | PASS |  |
| join | Stress P05 | 3460 | PASS |  |
| join | Stress P06 | 3462 | PASS |  |
| join | Stress P08 | 3458 | PASS |  |
| join | Stress P03 | 3854 | PASS |  |
| start game | Stress P01 | 25469 | PASS |  |
| answer | Stress P04 | 222 | PASS |  |
| answer | Stress P02 | 252 | PASS |  |
| answer | Stress P05 | 247 | PASS |  |
| answer | Stress P01 | 283 | PASS |  |
| answer | Stress P10 | 299 | PASS |  |
| answer | Stress P09 | 316 | PASS |  |
| answer | Stress P07 | 319 | PASS |  |
| answer | Stress P08 | 319 | PASS |  |
| answer | Stress P06 | 323 | PASS |  |
| answer | Stress P03 | 329 | PASS |  |
| answer quorum -> voting | all | 2956 | PASS | 2956 ms after the last answer confirmation. |
| vote | Stress P01 | 2327 | PASS |  |
| vote | Stress P10 | 2323 | PASS |  |
| vote | Stress P08 | 3302 | PASS |  |
| vote | Stress P06 | 3354 | PASS |  |
| vote | Stress P09 | 3352 | PASS |  |
| vote | Stress P02 | 3358 | PASS |  |
| vote | Stress P04 | 3357 | PASS |  |
| vote | Stress P05 | 3358 | PASS |  |
| vote | Stress P07 | 3358 | PASS |  |
| vote | Stress P03 | 3361 | PASS |  |
| total | all | 46486 | PASS |  |

## Diagnostics

- Console/page/request records captured: 271
- Relevant error records: 0

_No relevant framework/runtime errors were recorded._



## Failure / Blockers

_No blockers recorded._

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
