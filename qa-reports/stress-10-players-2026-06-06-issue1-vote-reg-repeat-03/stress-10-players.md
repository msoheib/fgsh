# 10-Player Stress Test Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-06-06T15:36:24.680Z
- Completed: 2026-06-06T15:36:47.842Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 10 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: XERXFZ

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room XERXFZ. |
| 10 players join successfully | PASS | 10 players joined isolated browser contexts. |
| TV lobby displays 10 / 10 players | PASS | TV lobby displayed 10 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 10 answers confirm | PASS | All 10 player answer confirmations completed. |
| Voting opens promptly after answer quorum | PASS | Voting opened 1926 ms after the last answer confirmation. |
| Voting opens for all players | PASS | Voting options appeared for all 10 players. |
| All 10 votes confirm | PASS | All 10 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No unexpected TV category-selection flash after answering begins | PASS | No TV category-selection wait screen was observed after answering began. |
| No relevant framework/runtime errors | PASS | No relevant runtime, page, request, or HTTP 5xx errors were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 3598 | PASS | Created TV room XERXFZ. |
| join | Stress P01 | 2315 | PASS |  |
| join | Stress P07 | 2430 | PASS |  |
| join | Stress P03 | 2496 | PASS |  |
| join | Stress P05 | 2508 | PASS |  |
| join | Stress P10 | 2510 | PASS |  |
| join | Stress P04 | 2734 | PASS |  |
| join | Stress P08 | 2748 | PASS |  |
| join | Stress P02 | 2873 | PASS |  |
| join | Stress P09 | 3357 | PASS |  |
| join | Stress P06 | 3589 | PASS |  |
| start game | Stress P01 | 6264 | PASS |  |
| answer | Stress P01 | 237 | PASS |  |
| answer | Stress P03 | 246 | PASS |  |
| answer | Stress P04 | 248 | PASS |  |
| answer | Stress P02 | 250 | PASS |  |
| answer | Stress P07 | 248 | PASS |  |
| answer | Stress P10 | 246 | PASS |  |
| answer | Stress P05 | 250 | PASS |  |
| answer | Stress P06 | 263 | PASS |  |
| answer | Stress P08 | 262 | PASS |  |
| answer | Stress P09 | 261 | PASS |  |
| answer quorum -> voting | all | 1926 | PASS | 1926 ms after the last answer confirmation. |
| vote | Stress P07 | 2076 | PASS |  |
| vote | Stress P10 | 2184 | PASS |  |
| vote | Stress P04 | 2202 | PASS |  |
| vote | Stress P08 | 2204 | PASS |  |
| vote | Stress P05 | 3197 | PASS |  |
| vote | Stress P02 | 3200 | PASS |  |
| vote | Stress P03 | 3220 | PASS |  |
| vote | Stress P06 | 3226 | PASS |  |
| vote | Stress P09 | 3225 | PASS |  |
| vote | Stress P01 | 3231 | PASS |  |
| total | all | 23160 | PASS |  |

## Diagnostics

- Console/page/request records captured: 22
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
