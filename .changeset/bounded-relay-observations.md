---
"@toughcrowd/cli": patch
---

Bound relay telemetry to one observation per rejection reason per invocation, cap concurrent telemetry deliveries, and show invalid callback warnings only once per listener.

Reserve delivery capacity for the command completion event so telemetry saturation preserves its outcome and failure diagnostic.
