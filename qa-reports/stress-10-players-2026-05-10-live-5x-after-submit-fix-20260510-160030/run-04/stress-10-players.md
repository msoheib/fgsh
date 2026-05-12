# 10-Player Stress Test Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-05-10T13:04:42.939Z
- Completed: 2026-05-10T13:05:28.203Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 10 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: S4GMQX

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room S4GMQX. |
| 10 players join successfully | PASS | 10 players joined isolated browser contexts. |
| TV lobby displays 10 / 10 players | PASS | TV lobby displayed 10 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 10 answers confirm | PASS | All 10 player answer confirmations completed. |
| Voting opens for all players | PASS | Voting options appeared for all 10 players. |
| All 10 votes confirm | PASS | All 10 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No unexpected TV category-selection flash after answering begins | PASS | No TV category-selection wait screen was observed after answering began. |
| No relevant framework/runtime errors | PASS | No relevant runtime, page, request, or HTTP 5xx errors were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 3768 | PASS | Created TV room S4GMQX. |
| join | Stress P01 | 2391 | PASS |  |
| join | Stress P09 | 2324 | PASS |  |
| join | Stress P08 | 2365 | PASS |  |
| join | Stress P05 | 2449 | PASS |  |
| join | Stress P06 | 2477 | PASS |  |
| join | Stress P02 | 2498 | PASS |  |
| join | Stress P07 | 2509 | PASS |  |
| join | Stress P10 | 2515 | PASS |  |
| join | Stress P03 | 2546 | PASS |  |
| join | Stress P04 | 2780 | PASS |  |
| start game | Stress P01 | 25492 | PASS |  |
| answer | Stress P06 | 273 | PASS |  |
| answer | Stress P01 | 279 | PASS |  |
| answer | Stress P07 | 274 | PASS |  |
| answer | Stress P02 | 278 | PASS |  |
| answer | Stress P05 | 276 | PASS |  |
| answer | Stress P08 | 274 | PASS |  |
| answer | Stress P10 | 273 | PASS |  |
| answer | Stress P04 | 279 | PASS |  |
| answer | Stress P03 | 281 | PASS |  |
| answer | Stress P09 | 276 | PASS |  |
| vote | Stress P06 | 4180 | PASS |  |
| vote | Stress P05 | 4181 | PASS |  |
| vote | Stress P10 | 4179 | PASS |  |
| vote | Stress P04 | 4184 | PASS |  |
| vote | Stress P07 | 4238 | PASS |  |
| vote | Stress P03 | 4243 | PASS |  |
| vote | Stress P02 | 4246 | PASS |  |
| vote | Stress P01 | 4248 | PASS |  |
| vote | Stress P09 | 5191 | PASS |  |
| vote | Stress P08 | 5255 | PASS |  |
| total | all | 45263 | PASS |  |

## Diagnostics

- Console/page/request records captured: 298
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
