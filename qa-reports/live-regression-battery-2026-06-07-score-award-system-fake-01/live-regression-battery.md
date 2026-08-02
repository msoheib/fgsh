# Live Regression Battery Report

- Status: **FAIL**
- Target URL: https://fgsh-web.vercel.app
- Started: 2026-06-06T21:59:19.568Z
- Completed: 2026-06-06T21:59:46.412Z
- Credentials: supplied through environment variables and intentionally not logged.

## Cases

| Case | Status | Duration ms | Details |
| --- | --- | ---: | --- |
| System fake penalty and fake-owner scoring | FAIL | 26659 | round answers including system truth and system fake timed out after 10000ms. Latest value: [{"id":"2653567f-6088-44c0-9d93-c240940a1f29","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":"b330135a-cc42-47df-9a39-a14cfb45db75","answer_text":"SysFake answer 3 1780783173893","is_correct":false},{"id":"633646af-883e-4f2c-9d31-26f94a3d44b3","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":"de1311f5-d023-443d-9302-4c0cf77b2470","answer_text":"SysFake answer 2 1780783173892","is_correct":false},{"id":"9e8976f0-b63f-43a1-9538-96d91ba503c1","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":"1eae4982-82e6-42ff-a9de-44ee142311bc","answer_text":"SysFake answer 1 1780783173891","is_correct":false},{"id":"eda11e6e-6a68-4991-b059-00bbf8a26a43","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":null,"answer_text":"انهيار نفسي","is_correct":true}] |

## Diagnostics

- Console/page/request records captured: 9
- Relevant error records: 0

_No relevant framework/runtime errors were recorded._



## Blockers / Failures

- System fake penalty and fake-owner scoring: round answers including system truth and system fake timed out after 10000ms. Latest value: [{"id":"2653567f-6088-44c0-9d93-c240940a1f29","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":"b330135a-cc42-47df-9a39-a14cfb45db75","answer_text":"SysFake answer 3 1780783173893","is_correct":false},{"id":"633646af-883e-4f2c-9d31-26f94a3d44b3","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":"de1311f5-d023-443d-9302-4c0cf77b2470","answer_text":"SysFake answer 2 1780783173892","is_correct":false},{"id":"9e8976f0-b63f-43a1-9538-96d91ba503c1","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":"1eae4982-82e6-42ff-a9de-44ee142311bc","answer_text":"SysFake answer 1 1780783173891","is_correct":false},{"id":"eda11e6e-6a68-4991-b059-00bbf8a26a43","round_id":"d84f0429-6511-4934-b79a-4b1dffccadc0","player_id":null,"answer_text":"انهيار نفسي","is_correct":true}]

## Screenshots

_No screenshots were captured._
