# Phase 1 performance

Measured 15 Oct 2026 in this cloud environment. This is not the Celeron gate.

|            |                                    |
| ---------- | ---------------------------------- |
| Browser    | Headless Chrome 154, SwiftShader   |
| Machine    | Linux container, 4 CPUs            |
| Play       | `trips-right-vs-cover2`, `?perf=1` |
| Draw calls | 6 in Broadcast, POV, and Top-down  |
| Triangles  | 1,742 in all three modes           |
| Budget     | ≤ 10 calls, ≤ 2,500 triangles      |

The rolling p95 on this software renderer sat around 18–21 ms, so the ladder stepped from L0 down to L2 during a 12 second run. That misses the 16.6 ms gate. An Intel Celeron 4 GB Chromebook has not been measured, so the hardware gate is still open.

Pick boxes live on layer 1. They raycast and do not draw. `CameraRig` uses a positive `useFrame` priority, which turns off React Three Fiber's automatic render, so the rig draws the frame itself. There is one draw per frame.

A 10 second allocation trace and a 10 minute soak were not captured here.
