<!-- Generated from tests/movement_latency_baseline.test.ts (BASELINE).
     Regenerate with UPDATE_MOVEMENT_BASELINE_DOC=1 npx vitest run
     tests/movement_latency_baseline.test.ts; never hand-edit. -->

# Movement latency baseline (v0.41.0)

What the online client DRAWS for the local player, scored against the
zero-latency authoritative trajectory for the same intent timeline.
Yards and yards per second; back = backward steps, dev = path deviation,
prog = along-path progress error, corr = correction events.

The three crowd-control rows are scored against the harness server's OWN
ticks instead: the zero-latency twin never receives the aura, so its
trajectory would be a fiction to compare against.

| cell | back n | back worst | dev max | dev mean | prog max | prog settle | speed err | speed delta | corr | input-authority max ms | input-authority mean ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| straight run + stop @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 | 0 | 50.0 | 39.0 |
| straight run + stop @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.097 | 0.000 | 0.00 | 0.00 | 0 | 66.7 | 66.7 |
| straight run + stop @ 150 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.136 | 0.000 | 0.00 | 0.00 | 0 | 100.0 | 100.0 |
| straight run + stop @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.082 | 0.000 | 0.00 | 0.00 | 0 | 216.7 | 216.7 |
| curved steering @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 | 0 | 50.0 | 39.0 |
| curved steering @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.097 | 0.000 | 0.01 | 0.01 | 0 | 66.7 | 66.7 |
| curved steering @ 150 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.136 | 0.000 | 0.01 | 0.01 | 0 | 100.0 | 100.0 |
| curved steering @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.082 | 0.000 | 0.01 | 0.01 | 0 | 216.7 | 216.7 |
| strafe weave @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 | 0 | 50.0 | 39.0 |
| strafe weave @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.097 | 0.000 | 0.00 | 0.00 | 0 | 66.7 | 66.7 |
| strafe weave @ 150 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.136 | 0.000 | 0.00 | 0.00 | 0 | 100.0 | 100.0 |
| strafe weave @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.082 | 0.000 | 0.00 | 0.00 | 0 | 216.7 | 216.7 |
| run with jump @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 | 0 | 50.0 | 39.0 |
| run with jump @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.097 | 0.000 | 0.00 | 0.00 | 0 | 66.7 | 66.7 |
| run with jump @ 150 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.136 | 0.000 | 0.00 | 0.00 | 0 | 100.0 | 100.0 |
| run with jump @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.082 | 0.000 | 0.00 | 0.00 | 0 | 216.7 | 216.7 |
| start-stop tapping @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 | 0 | 50.0 | 40.3 |
| start-stop tapping @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.097 | 0.000 | 0.00 | 0.00 | 0 | 66.7 | 66.7 |
| start-stop tapping @ 150 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.136 | 0.000 | 0.00 | 0.00 | 0 | 100.0 | 100.0 |
| start-stop tapping @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.082 | 0.000 | 0.00 | 0.00 | 0 | 216.7 | 216.7 |
| HOL stall 500 ms mid-run | 0 | 0.0000 | 0.000 | 0.000 | 0.136 | 0.000 | 0.00 | 0.00 | 0 | 100.0 | 100.0 |
| server stun mid-run | 24 | -0.1979 | 0.000 | 0.000 | 1.399 | 0.000 | 14.32 | 13.83 | 14 | 100.0 | 100.0 |
| server snare mid-run | 9 | -0.1982 | 0.000 | 0.000 | 1.177 | 0.000 | 14.07 | 13.90 | 9 | 100.0 | 100.0 |
| server stun apply and expire twice | 42 | -0.1974 | 0.000 | 0.000 | 1.392 | 0.000 | 14.23 | 13.85 | 30 | 100.0 | 100.0 |
| straight run + stop @ 300 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.056 | 0.000 | 0.00 | 0.00 | 0 | 183.3 | 183.3 |
