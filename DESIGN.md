# Faultline design

## Concept

Civil-defence network table in bright operations-room daylight. The tension is emergency severity rendered with calm, inspectable precision.

## Signature

The topology is the interface. Pressing a fault control physically tears a live connection, sends traffic around the break, and changes quorum and latency at the same moment.

## System

- Strategy: committed cobalt surface with signal red reserved for actual faults.
- Palette: `oklch(0.46 0.15 270)` cobalt, `oklch(0.97 0 0)` chalk, `oklch(0.58 0.21 27)` fault red, `oklch(0.84 0.16 96)` warning yellow, `oklch(0.17 0.02 270)` ink.
- Type: Archivo Black for the one display statement; Azeret Mono for controls, state, and logs.
- Layout: asymmetric three-zone operations table. Controls are narrow; the network owns the surface; the event tape stays readable under stress.
- Shape: hard panels, clipped corners, one-pixel rules, circular nodes. No decorative cards.
- Motion personality: energetic but rigid. `cubic-bezier(0.16, 1, 0.3, 1)`, 120/220/480ms.

## Self-critique

A dark terminal look would be the expected category reflex. Bright cobalt makes the system feel more like public infrastructure than hacker theatre. Red appears only when the model is actually degraded.
