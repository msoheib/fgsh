# 10-Player Stress Test Report

- Status: **FAIL**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-05-08T21:40:24.171Z
- Completed: 2026-05-08T21:42:23.625Z
- Browser: chromium
- Viewports: TV/host 1440x900; players 390x844 in 10 isolated contexts
- Credentials: supplied through environment variables and intentionally not logged.
- Game code: 3NTWDT

## Acceptance Criteria

| Criterion | Status | Details |
| --- | --- | --- |
| Required environment variables are present | PASS | All required env vars are set. |
| Host can log in and create a TV room | PASS | Created TV room 3NTWDT. |
| 10 players join successfully | PASS | 10 players joined isolated browser contexts. |
| TV lobby displays 10 / 10 players | PASS | TV lobby displayed 10 / 10 players. |
| Game starts for TV and players | PASS | TV and player pages reached the first answering state. |
| All 10 answers confirm | PASS | All 10 player answer confirmations completed. |
| Voting opens for all players | PASS | Voting options appeared for all 10 players. |
| All 10 votes confirm | PASS | All 10 player vote confirmations completed. |
| Round reaches completed/reveal state | PASS | Voting options disappeared after completion, and completed/reveal screenshots were captured. |
| No unexpected TV category-selection flash after answering begins | FAIL | 1 unexpected TV category-selection wait sample(s) observed after answering began. |
| No relevant framework/runtime errors | FAIL | 12 relevant diagnostic records were captured. |

## Timings

| Phase | Actor | Duration ms | Status | Details |
| --- | --- | ---: | --- | --- |
| create room | host | 3793 | PASS | Created TV room 3NTWDT. |
| join | Stress P01 | 2282 | PASS |  |
| join | Stress P04 | 2565 | PASS |  |
| join | Stress P03 | 2568 | PASS |  |
| join | Stress P10 | 2542 | PASS |  |
| join | Stress P05 | 2635 | PASS |  |
| join | Stress P02 | 2697 | PASS |  |
| join | Stress P06 | 2805 | PASS |  |
| join | Stress P09 | 2841 | PASS |  |
| join | Stress P08 | 2852 | PASS |  |
| join | Stress P07 | 2902 | PASS |  |
| start game | Stress P01 | 25463 | PASS |  |
| answer | Stress P05 | 144 | PASS |  |
| answer | Stress P02 | 149 | PASS |  |
| answer | Stress P09 | 143 | PASS |  |
| answer | Stress P07 | 150 | PASS |  |
| answer | Stress P08 | 151 | PASS |  |
| answer | Stress P03 | 157 | PASS |  |
| answer | Stress P01 | 185 | PASS |  |
| answer | Stress P10 | 176 | PASS |  |
| answer | Stress P06 | 180 | PASS |  |
| answer | Stress P04 | 182 | PASS |  |
| vote | Stress P01 | 202 | PASS |  |
| vote | Stress P06 | 199 | PASS |  |
| vote | Stress P05 | 201 | PASS |  |
| vote | Stress P04 | 206 | PASS |  |
| vote | Stress P08 | 204 | PASS |  |
| vote | Stress P10 | 203 | PASS |  |
| vote | Stress P02 | 210 | PASS |  |
| vote | Stress P03 | 211 | PASS |  |
| vote | Stress P07 | 209 | PASS |  |
| vote | Stress P09 | 212 | PASS |  |
| total | all | 119245 | FAIL |  |
| total | all | 119453 | FAIL | stress-test acceptance status<br><br>[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m<br><br>Expected: [32m"pass"[39m<br>Received: [31m"fail"[39m |

## Diagnostics

- Console/page/request records captured: 301
- Relevant error records: 12

| Source | Type | Status | URL | Message |
| --- | --- | ---: | --- | --- |
| Stress P01 | console |  | https://fgsh-web.vercel.app/lobby | [error] WebSocket connection to 'wss://yabticelgerjwzrhyaye.supabase.co/realtime/v1/websocket?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhYnRpY2VsZ2Vyand6cmh5YXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4NzcyNDQsImV4cCI6MjA3NjQ1MzI0NH0.hSFVkv5OtIe_1dYz57bzgPqVEfVxtToww_NtkcIVyDo&eventsPerSecond=10&vsn=1.0.0' failed: Error during WebSocket handshake: Unexpected response code: 502 |
| Stress P04 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P03 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P09 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P02 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P07 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P01 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| TV/host | console |  | https://fgsh-web.vercel.app/tv/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P06 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P08 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P05 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |
| Stress P10 | console |  | https://fgsh-web.vercel.app/game | [error] The AudioContext encountered an error from the audio device or the WebAudio renderer. |


## Failure / Blockers

- Unexpected TV category-selection wait screen appeared after answering began.
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

Unexpected TV category-selection flash

![Unexpected TV category-selection flash](screenshots/category-flash-detected.png)

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
