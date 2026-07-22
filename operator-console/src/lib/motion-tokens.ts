// Shared design/motion constants — Day 1 decision, not to be reinvented per-task.
// See docs/near-ai-findings.md sibling doc for context; this file has no animation
// logic, just the values later GSAP work should read from.

export const color = {
  accent: "#17C3A2", // teal
  background: "#0B1220", // deep navy — proposed, confirm against brand later
} as const;

export const easing = {
  standard: "power3.inOut", // GSAP core easing, no plugin required
} as const;

export const duration = {
  fast: 0.12, // seconds — micro-feedback: kill-switch press, toggle states
  base: 0.24, // seconds — panel transitions, feed row entrance
  slow: 0.4, // seconds — modal open, policy-publish confirmation
} as const;
