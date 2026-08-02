# 10-Player Stress Test Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-06-06T15:35:37.186Z
- Completed: 2026-06-06T15:36:21.435Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 10 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: M8H8RL

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room M8H8RL. |
| 10 players join successfully | PASS | 10 players joined isolated browser contexts. |
| TV lobby displays 10 / 10 players | PASS | TV lobby displayed 10 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 10 answers confirm | PASS | All 10 player answer confirmations completed. |
| Voting opens promptly after answer quorum | PASS | Voting opened 2943 ms after the last answer confirmation. |
| Voting opens for all players | PASS | Voting options appeared for all 10 players. |
| All 10 votes confirm | PASS | All 10 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No unexpected TV category-selection flash after answering begins | PASS | No TV category-selection wait screen was observed after answering began. |
| No relevant framework/runtime errors | PASS | No relevant runtime, page, request, or HTTP 5xx errors were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 3509 | PASS | Created TV room M8H8RL. |
| join | Stress P01 | 2340 | PASS |  |
| join | Stress P02 | 2463 | PASS |  |
| join | Stress P05 | 2462 | PASS |  |
| join | Stress P03 | 2491 | PASS |  |
| join | Stress P09 | 2484 | PASS |  |
| join | Stress P04 | 2508 | PASS |  |
| join | Stress P07 | 2668 | PASS |  |
| join | Stress P08 | 2742 | PASS |  |
| join | Stress P06 | 2980 | PASS |  |
| join | Stress P10 | 3232 | PASS |  |
| start game | Stress P01 | 26571 | PASS |  |
| answer | Stress P07 | 235 | PASS |  |
| answer | Stress P04 | 238 | PASS |  |
| answer | Stress P02 | 253 | PASS |  |
| answer | Stress P08 | 253 | PASS |  |
| answer | Stress P06 | 255 | PASS |  |
| answer | Stress P05 | 256 | PASS |  |
| answer | Stress P03 | 275 | PASS |  |
| answer | Stress P09 | 271 | PASS |  |
| answer | Stress P01 | 279 | PASS |  |
| answer | Stress P10 | 273 | PASS |  |
| answer quorum -> voting | all | 2943 | PASS | 2943 ms after the last answer confirmation. |
| vote | Stress P08 | 2119 | PASS |  |
| vote | Stress P05 | 2122 | PASS |  |
| vote | Stress P09 | 2121 | PASS |  |
| vote | Stress P02 | 2127 | PASS |  |
| vote | Stress P07 | 2124 | PASS |  |
| vote | Stress P06 | 2174 | PASS |  |
| vote | Stress P01 | 2179 | PASS |  |
| vote | Stress P10 | 2173 | PASS |  |
| vote | Stress P03 | 2179 | PASS |  |
| vote | Stress P04 | 3184 | PASS |  |
| total | all | 44247 | PASS |  |

## Diagnostics

- Console/page/request records captured: 286
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
