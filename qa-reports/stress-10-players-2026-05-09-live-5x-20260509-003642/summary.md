# 10-Player Live Stress Test - 5 Runs

- Target URL: https://fgsh-web.vercel.app/
- Started: 2026-05-09 00:36:42
- Completed: 2026-05-09 00:46:30
- Browser: Chromium via Playwright
- Player load: 10 isolated player contexts per run
- Category flash watch: active after the first answering state began until completed/reveal state
- Credentials: supplied through environment variables and intentionally not logged.

## Result

Gameplay load passed in all 5 runs: room creation, 10 joins, 10 / 10 TV lobby count, game start, 10 answers, voting, 10 votes, and completed/reveal state all succeeded.

The TV category-selection flash was reproduced in 4 of 5 live runs after answering had already started.

| Run | Status | Game code | Duration | Category flash check | Relevant diagnostic records | Report |
| --- | --- | --- | ---: | --- | ---: | --- |
| run-01 | PASS | LBUHB4 | 93.6s | PASS, no flash observed | 0 | [report](run-01/stress-10-players.md) |
| run-02 | FAIL | D11D2A | 124.0s | FAIL, 1 flash sample | 12 | [report](run-02/stress-10-players.md) |
| run-03 | FAIL | 3NTWDT | 123.6s | FAIL, 1 flash sample | 12 | [report](run-03/stress-10-players.md) |
| run-04 | FAIL | RWKNZY | 122.5s | FAIL, 1 flash sample | 11 | [report](run-04/stress-10-players.md) |
| run-05 | FAIL | K5WMHZ | 123.2s | FAIL, 2 flash samples | 11 | [report](run-05/stress-10-players.md) |

## Flash Evidence

Captured examples:

- [run-02 category flash screenshot](run-02/screenshots/category-flash-detected.png)
- [run-03 category flash screenshot](run-03/screenshots/category-flash-detected.png)
- [run-04 category flash screenshot](run-04/screenshots/category-flash-detected.png)
- [run-05 category flash screenshot](run-05/screenshots/category-flash-detected.png)

The captured screen is the TV category-selection wait page, showing the Arabic "leader chooses question category" state with a selected category and countdown. This appeared after the watcher had already observed player answer inputs.

## Diagnostic Notes

The relevant diagnostic records are mostly Chromium/Playwright audio device errors from running 10 concurrent contexts:

- `The AudioContext encountered an error from the audio device or the WebAudio renderer.`

There was also one Supabase Realtime aborted broadcast request in run-02. These diagnostics did not block gameplay progression, but they are retained in the per-run reports.

## Artifacts

- `summary.json` contains machine-readable run metadata.
- Each `run-XX/` folder contains:
  - `stress-10-players.md`
  - `playwright-console.log`
  - `screenshots/`
  - `playwright-output/`
