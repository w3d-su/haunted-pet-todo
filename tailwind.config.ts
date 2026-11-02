import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        "bg-void": "var(--color-bg-void)",
        "bg-panel": "var(--color-bg-panel)",
        "bg-panel-raised": "var(--color-bg-panel-raised)",
        "ghost-white": "var(--color-ghost-white)",
        "ghost-dim": "var(--color-ghost-dim)",
        pumpkin: "var(--color-pumpkin)",
        "pumpkin-dark": "var(--color-pumpkin-dark)",
        slime: "var(--color-slime)",
        "slime-dark": "var(--color-slime-dark)",
        blood: "var(--color-blood)",
        "blood-dark": "var(--color-blood-dark)",
        "mood-purple": "var(--color-mood-purple)",
        bone: "var(--color-bone)",
      },
    },
  },
};

export default config;
