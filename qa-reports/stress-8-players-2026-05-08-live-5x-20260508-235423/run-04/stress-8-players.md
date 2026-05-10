# 8-Player Stress Test Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-05-08T20:58:53.822Z
- Completed: 2026-05-08T21:00:19.631Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 8 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: Y02AEC

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room Y02AEC. |
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
| create room | host | 4006 | PASS | Created TV room Y02AEC. |
| join | Stress P01 | 2328 | PASS |  |
| join | Stress P02 | 2335 | PASS |  |
| join | Stress P05 | 2443 | PASS |  |
| join | Stress P06 | 2477 | PASS |  |
| join | Stress P07 | 2475 | PASS |  |
| join | Stress P04 | 2701 | PASS |  |
| join | Stress P03 | 2856 | PASS |  |
| join | Stress P08 | 2841 | PASS |  |
| start game | Stress P01 | 25794 | PASS |  |
| answer | Stress P03 | 159 | PASS |  |
| answer | Stress P02 | 161 | PASS |  |
| answer | Stress P01 | 166 | PASS |  |
| answer | Stress P04 | 214 | PASS |  |
| answer | Stress P07 | 212 | PASS |  |
| answer | Stress P06 | 214 | PASS |  |
| answer | Stress P08 | 213 | PASS |  |
| answer | Stress P05 | 217 | PASS |  |
| vote | Stress P08 | 182 | PASS |  |
| vote | Stress P07 | 183 | PASS |  |
| vote | Stress P04 | 186 | PASS |  |
| vote | Stress P03 | 188 | PASS |  |
| vote | Stress P05 | 187 | PASS |  |
| vote | Stress P01 | 192 | PASS |  |
| vote | Stress P02 | 192 | PASS |  |
| vote | Stress P06 | 190 | PASS |  |
| total | all | 85807 | PASS |  |

## Diagnostics

- Console/page/request records captured: 228
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
