<!-- Generated from tests/movement_latency_baseline.test.ts (BASELINE).
     Regenerate with UPDATE_MOVEMENT_BASELINE_DOC=1 npx vitest run
     tests/movement_latency_baseline.test.ts; never hand-edit. -->

# Movement latency baseline (v0.41.0)

What the online client DRAWS for the local player, scored against the
zero-latency authoritative trajectory for the same intent timeline.
Yards and yards per second; back = backward steps, dev = path deviation,
prog = along-path progress error, corr = correction events.

The two crowd-control rows are scored against the harness server's OWN
ticks instead: the zero-latency twin never receives the aura, so its
trajectory would be a fiction to compare against.

| cell | back n | back worst | dev max | dev mean | prog max | prog settle | speed err | speed delta | corr |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| straight run + stop @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.190 | -0.038 | 2.08 | 2.18 | 0 |
| straight run + stop @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.266 | -0.004 | 2.13 | 2.16 | 0 |
| straight run + stop @ 150 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.305 | 0.305 | 2.03 | 2.49 | 0 |
| straight run + stop @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.523 | 0.096 | 3.53 | 3.62 | 0 |
| curved steering @ 0 ms | 0 | 0.0000 | 0.059 | 0.026 | 0.193 | -0.086 | 1.97 | 2.20 | 0 |
| curved steering @ 50 ms | 0 | 0.0000 | 0.251 | 0.110 | 0.330 | -0.164 | 2.20 | 2.16 | 0 |
| curved steering @ 150 ms + 20 jitter | 0 | 0.0000 | 0.190 | 0.093 | 0.329 | -0.047 | 1.66 | 2.22 | 0 |
| curved steering @ 300 ms + 40 jitter | 0 | 0.0000 | 0.174 | 0.068 | 0.555 | -0.317 | 2.46 | 2.52 | 0 |
| strafe weave @ 0 ms | 0 | 0.0000 | 0.117 | 0.012 | 0.255 | -0.088 | 2.00 | 2.14 | 0 |
| strafe weave @ 50 ms | 0 | -0.0001 | 0.100 | 0.007 | 0.286 | -0.157 | 2.04 | 2.13 | 0 |
| strafe weave @ 150 ms + 20 jitter | 7 | -0.0046 | 0.639 | 0.247 | 0.874 | 0.214 | 5.15 | 4.99 | 3 |
| strafe weave @ 300 ms + 40 jitter | 0 | 0.0000 | 0.258 | 0.101 | 0.730 | -0.379 | 4.18 | 4.40 | 0 |
| run with jump @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.190 | -0.086 | 2.08 | 2.18 | 0 |
| run with jump @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.266 | -0.160 | 2.13 | 2.16 | 0 |
| run with jump @ 150 ms + 20 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.305 | -0.155 | 2.03 | 2.49 | 0 |
| run with jump @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.523 | -0.281 | 3.53 | 3.62 | 0 |
| start-stop tapping @ 0 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.203 | -0.038 | 0.96 | 0.67 | 0 |
| start-stop tapping @ 50 ms | 0 | 0.0000 | 0.000 | 0.000 | 0.273 | -0.002 | 1.29 | 1.41 | 0 |
| start-stop tapping @ 150 ms + 20 jitter | 2 | -0.0024 | 0.000 | 0.000 | 1.222 | -0.859 | 1.06 | 1.06 | 0 |
| start-stop tapping @ 300 ms + 40 jitter | 0 | 0.0000 | 0.000 | 0.000 | 0.233 | 0.156 | 0.38 | 0.16 | 0 |
| HOL stall 500 ms mid-run | 12 | -0.0160 | 0.000 | 0.000 | 3.371 | -0.124 | 7.16 | 6.41 | 6 |
| server stun mid-run | 12 | -0.3781 | 0.000 | 0.000 | 0.966 | 0.032 | 15.68 | 14.93 | 8 |
| server snare mid-run | 1 | -0.1866 | 0.000 | 0.000 | 0.558 | 0.199 | 6.20 | 9.98 | 1 |
