export const SEVERITY_LEVELS = [
  {
    level: "CRITICAL",
    description:
      "Directly exploitable and can cause loss of funds or full compromise of the protocol.",
  },
  {
    level: "HIGH",
    description:
      "Likely exploitable with significant impact. Fix before deployment.",
  },
  {
    level: "MEDIUM",
    description:
      "Exploitable under specific conditions or with limited impact.",
  },
  {
    level: "LOW",
    description: "Minor issue with low impact or unlikely to be exploited.",
  },
  {
    level: "INFO",
    description:
      "Code quality or best-practice note with no direct security impact.",
  },
];
