# Live Regression Battery Report

- Status: **PASS**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-06-06T15:41:24.739Z
- Completed: 2026-06-06T15:42:54.355Z
- Credentials: supplied through environment variables and intentionally not logged.

## Cases

| Case | Status | Duration ms | Details |
| --- | --- | ---: | --- |
| Deterministic vote registration and scoring | PASS | 22462 | All 3 votes persisted exactly once and scores matched expected totals (VoteScore P01:500, VoteScore P02:500, VoteScore P03:1000). |
| Near-timeout selected vote must persist or clear cleanly | PASS | 66958 | No late vote persisted and no selected UI state was observed. |

## Diagnostics

- Console/page/request records captured: 20
- Relevant error records: 0

_No relevant framework/runtime errors were recorded._



## Blockers / Failures

_No blockers recorded._

## Screenshots

Deterministic vote scoring reveal

![Deterministic vote scoring reveal](screenshots/vote-score-reveal.png)

Late vote selected before confirmation timeout

![Late vote selected before confirmation timeout](screenshots/late-vote-selected.png)
