// Shared design/motion constants — Day 1 decision, not to be reinvented per-task.
// This file has no animation logic, just the values the UI reads from.

export const color = {
  accent: "#17C3A2", // teal — the single accent; never introduce a second one
  background: "#0B1220", // deep navy
} as const;

export const easing = {
  standard: "power3.inOut", // GSAP core easing, no plugin required
  // CSS equivalent for the scroll-reveal transitions, which are plain CSS
  // rather than GSAP. Same shape as power3.inOut so reveals and the GSAP
  // micro-animations read as one system.
  standardCss: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

export const duration = {
  fast: 0.12, // seconds — micro-feedback: kill-switch press, toggle states
  base: 0.24, // seconds — panel transitions, feed row entrance
  slow: 0.4, // seconds — modal open, policy-publish confirmation
  // Scroll-reveal is a deliberately larger move than any in-panel feedback, so
  // it gets its own token rather than stretching `slow` at each call site.
  reveal: 0.7, // seconds — a panel fading and rising into view
} as const;

// Delay between sibling reveals inside one section, in milliseconds. Small
// enough to read as one gesture rather than a queue.
export const stagger = 90;
