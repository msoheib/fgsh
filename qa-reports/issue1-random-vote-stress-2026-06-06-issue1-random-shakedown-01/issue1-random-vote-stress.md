# Issue 1 Random Vote Stress Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-06-06T16:31:42.847Z
- Completed: 2026-06-06T16:32:10.995Z
- Random seed: 606001
- Runs requested: 1
- Player range: 6-6
- Credentials: supplied through environment variables and intentionally not logged.

## Runs

| Run | Status | Players | Mode | Duration ms | Game | Round | Details |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 1 | PASS | 6 | holdback | 27605 | CLISSU | 634f5099-093b-41a5-9aa9-404ffa924d38 | 6/6 vote rows persisted exactly once and matched clicked answer IDs. |

## Diagnostics

- Console/page/request records captured: 13
- Relevant error records: 0

_No relevant framework/runtime errors were recorded._



## Blockers / Failures

_No blockers recorded._

## Screenshots

run 1 completed player state

![run 1 completed player state](screenshots/run-01-player-completed.png)
