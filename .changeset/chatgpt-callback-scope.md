---
"@toughcrowd/cli": patch
---

Tolerate additional provider parameters in ChatGPT authorization callbacks while validating state and an unambiguous code or error. Forward only consumed callback fields and report rejected callbacks in the terminal without logging credentials.

Report rejected callbacks and sent redirects through the shared CLI telemetry reporter using schema v2, honoring opt-outs and the silent 500 ms delivery budget.
