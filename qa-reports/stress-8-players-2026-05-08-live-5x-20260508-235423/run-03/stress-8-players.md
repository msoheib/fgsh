# 8-Player Stress Test Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-05-08T20:57:25.863Z
- Completed: 2026-05-08T20:58:50.575Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 8 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: JMLHQG

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room JMLHQG. |
| 8 players join successfully | PASS | 8 players joined isolated browser contexts. |
| TV lobby displays 8 / 10 players | PASS | TV lobby displayed 8 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 8 answers confirm | PASS | All 8 player answer confirmations completed. |
| Voting opens for all players | PASS | Voting options appeared for all 8 players. |
| All 8 votes confirm | PASS | All 8 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No relevant framework/runtime errors | PASS | No relevant runtime, page, request, or HTTP 5xx errors were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 3590 | PASS | Created TV room JMLHQG. |
| join | Stress P01 | 2493 | PASS |  |
| join | Stress P08 | 2340 | PASS |  |
| join | Stress P03 | 2441 | PASS |  |
| join | Stress P02 | 2461 | PASS |  |
| join | Stress P05 | 2454 | PASS |  |
| join | Stress P06 | 2507 | PASS |  |
| join | Stress P07 | 2525 | PASS |  |
| join | Stress P04 | 2877 | PASS |  |
| start game | Stress P01 | 25156 | PASS |  |
| answer | Stress P04 | 159 | PASS |  |
| answer | Stress P07 | 157 | PASS |  |
| answer | Stress P08 | 158 | PASS |  |
| answer | Stress P02 | 165 | PASS |  |
| answer | Stress P06 | 162 | PASS |  |
| answer | Stress P03 | 167 | PASS |  |
| answer | Stress P05 | 166 | PASS |  |
| answer | Stress P01 | 180 | PASS |  |
| vote | Stress P02 | 164 | PASS |  |
| vote | Stress P05 | 163 | PASS |  |
| vote | Stress P01 | 167 | PASS |  |
| vote | Stress P08 | 165 | PASS |  |
| vote | Stress P04 | 169 | PASS |  |
| vote | Stress P03 | 170 | PASS |  |
| vote | Stress P06 | 169 | PASS |  |
| vote | Stress P07 | 169 | PASS |  |
| total | all | 84710 | PASS |  |

## Diagnostics

- Console/page/request records captured: 223
- Relevant error records: 0

_No relevant framework/runtime errors were recorded._



## Failure / Blockers

_No blockers recorded._

## Screenshots

TV lobby with 8 players

![TV lobby with 8 players](screenshots/01-tv-lobby-8-players.png)

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
