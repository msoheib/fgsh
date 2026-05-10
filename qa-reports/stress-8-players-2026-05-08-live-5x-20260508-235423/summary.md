# 8-Player Live Stress Test - 5 Runs

- Target URL: https://fgsh-web.vercel.app/
- Started: 2026-05-08 23:54:23
- Completed: 2026-05-09 00:01:49
- Browser: Chromium via Playwright
- Player load: 8 isolated player contexts per run
- Credentials: supplied through environment variables and intentionally not logged.

## Result

All 5 live runs passed. Each run created a host TV room, joined 8 players, started one round, submitted 8 answers, opened voting, submitted 8 votes, reached completed/reveal state, and reported 0 relevant framework/runtime errors.

| Run | Status | Game code | Duration | Relevant errors | Report |
| --- | --- | --- | ---: | ---: | --- |
| run-01 | PASS | LKJDVD | 90.3s | 0 | [report](run-01/stress-8-players.md) |
| run-02 | PASS | 5ZONTG | 89.5s | 0 | [report](run-02/stress-8-players.md) |
| run-03 | PASS | JMLHQG | 88.0s | 0 | [report](run-03/stress-8-players.md) |
| run-04 | PASS | Y02AEC | 89.0s | 0 | [report](run-04/stress-8-players.md) |
| run-05 | PASS | 9I33H6 | 89.2s | 0 | [report](run-05/stress-8-players.md) |

## Artifacts

- `summary.json` contains machine-readable run metadata.
- Each `run-XX/` folder contains:
  - `stress-8-players.md`
  - `playwright-console.log`
  - `screenshots/`
  - `playwright-output/`
