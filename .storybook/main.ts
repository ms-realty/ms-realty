// Component workbench (docs/ux-spec.md §23.3): every src/ui component and state as a story.
// `npm run storybook` serves it; `npm run storybook:build` writes storybook-static/, which the
// visual tests (e2e/visual.spec.ts) screenshot and the storybook Vitest project exercises.
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-vitest"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  // Self-hosted fonts and brand assets resolve from the same paths as in the app.
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
};

export default config;
