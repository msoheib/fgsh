# 10-Player Stress Test Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-05-13T10:44:46.641Z
- Completed: 2026-05-13T10:45:30.719Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 10 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: YFOKYN

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room YFOKYN. |
| 10 players join successfully | PASS | 10 players joined isolated browser contexts. |
| TV lobby displays 10 / 10 players | PASS | TV lobby displayed 10 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 10 answers confirm | PASS | All 10 player answer confirmations completed. |
| Voting opens promptly after answer quorum | PASS | Voting opened 1946 ms after the last answer confirmation. |
| Voting opens for all players | PASS | Voting options appeared for all 10 players. |
| All 10 votes confirm | PASS | All 10 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No unexpected TV category-selection flash after answering begins | PASS | No TV category-selection wait screen was observed after answering began. |
| No relevant framework/runtime errors | PASS | No relevant runtime, page, request, or HTTP 5xx errors were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 3813 | PASS | Created TV room YFOKYN. |
| join | Stress P01 | 2393 | PASS |  |
| join | Stress P03 | 2474 | PASS |  |
| join | Stress P10 | 2558 | PASS |  |
| join | Stress P06 | 2591 | PASS |  |
| join | Stress P04 | 2704 | PASS |  |
| join | Stress P05 | 2777 | PASS |  |
| join | Stress P09 | 2838 | PASS |  |
| join | Stress P02 | 2908 | PASS |  |
| join | Stress P07 | 3194 | PASS |  |
| join | Stress P08 | 3277 | PASS |  |
| start game | Stress P01 | 26818 | PASS |  |
| answer | Stress P04 | 227 | PASS |  |
| answer | Stress P09 | 250 | PASS |  |
| answer | Stress P08 | 252 | PASS |  |
| answer | Stress P02 | 259 | PASS |  |
| answer | Stress P06 | 264 | PASS |  |
| answer | Stress P07 | 265 | PASS |  |
| answer | Stress P01 | 279 | PASS |  |
| answer | Stress P05 | 275 | PASS |  |
| answer | Stress P10 | 273 | PASS |  |
| answer | Stress P03 | 278 | PASS |  |
| answer quorum -> voting | all | 1946 | PASS | 1946 ms after the last answer confirmation. |
| vote | Stress P04 | 2202 | PASS |  |
| vote | Stress P05 | 3106 | PASS |  |
| vote | Stress P09 | 3128 | PASS |  |
| vote | Stress P02 | 3134 | PASS |  |
| vote | Stress P10 | 3221 | PASS |  |
| vote | Stress P08 | 3223 | PASS |  |
| vote | Stress P01 | 3230 | PASS |  |
| vote | Stress P07 | 3226 | PASS |  |
| vote | Stress P03 | 3229 | PASS |  |
| vote | Stress P06 | 3228 | PASS |  |
| total | all | 44076 | PASS |  |

## Diagnostics

- Console/page/request records captured: 281
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
