# 10-Player Live Stress Test x5 Summary After Submit Fix

- Target URL: https://fgsh-web.vercel.app/
- Run timestamp: 2026-05-10 Asia/Riyadh
- Browser: Chromium via Playwright
- Player load: 10 isolated mobile player contexts plus TV/host context
- Credentials: supplied through environment variables and intentionally not logged.
- Live bundle checked before the run: TV category prompt guard was present.
- Result: 5 / 5 runs passed, 0 / 5 failed.
- TV category-selection flash: observed in 0 / 5 runs.
- Relevant runtime/request errors across final loop: 0.
- Average run duration: 50 seconds.

## Per-Run Results

| Run | Status | Game Code | Category Flash Check | Relevant Errors | Total Timing | Report |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | Y72B3P | PASS - 0 flash samples | 0 | 52154 ms | [run-01\stress-10-players.md](run-01\stress-10-players.md) |
| 2 | PASS | AJDTCD | PASS - 0 flash samples | 0 | 46116 ms | [run-02\stress-10-players.md](run-02\stress-10-players.md) |
| 3 | PASS | CFZJ36 | PASS - 0 flash samples | 0 | 46056 ms | [run-03\stress-10-players.md](run-03\stress-10-players.md) |
| 4 | PASS | S4GMQX | PASS - 0 flash samples | 0 | 45263 ms | [run-04\stress-10-players.md](run-04\stress-10-players.md) |
| 5 | PASS | 726RDE | PASS - 0 flash samples | 0 | 44321 ms | [run-05\stress-10-players.md](run-05\stress-10-players.md) |

## Notes

- An initial 5-run attempt after the category migration found no category flash, but all five runs were blocked by answer submission error 42P10.
- A follow-up migration replaced the invalid submit_answer ON CONFLICT target for nullable player_id schemas.
- This summary covers the clean rerun after that blocker was fixed.

