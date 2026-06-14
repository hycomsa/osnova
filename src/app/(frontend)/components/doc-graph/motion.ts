// Parametry ruchu/układu — pojedyncze źródło do strojenia. Świadomie wolne (feedback: „za szybko").
export const RADIUS = [0, 6.2, 2.6, 1.4] // promień orbity wg stopnia
export const SPEED = [0, 0.025, 0.05, 0.07] // prędkość obiegu wg stopnia (rad/s) — spokojna
export const BODY = [1.1, 0.5, 0.34, 0.24] // bazowy promień ciała wg stopnia
export const AUTO_ROTATE = 0.12 // OrbitControls autoRotateSpeed
export const DAMPING = 0.05
export const PULSE_FREQ = 0.6
export const PULSE_AMP = 0.04
// smugi orbity (drei Trail) — tylko 1. stopień (perf/GL: każdy Trail to osobna geometria;
// głębsze ciała orbitują blisko rodzica i ich ruch widać bez smugi)
export const TRAIL_MAX_DEPTH = 1
