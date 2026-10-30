---
"@toughcrowd/cli": minor
---

Add best-effort CLI command telemetry with safe failure diagnostics and request correlation. Disable collection with `TOUGHCROWD_TELEMETRY=0` or `DO_NOT_TRACK=1`. Reporting uses the selected API origin, never reads the keychain, and bounds shutdown delivery to 500 ms.
