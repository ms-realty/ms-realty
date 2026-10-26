// O23/O24/O26: fixed, issuable settings scopes. No settings scope widens a role preset.
export const settingsResources = {
  operatingPolicy: "00000000-0000-4000-8000-000000000024",
  privacyGovernance: "00000000-0000-4000-8000-000000000026",
  serviceScope: "00000000-0000-4000-8000-000000000029",
} as const;
export type SettingsResourceKey = keyof typeof settingsResources;
export const settingsResourceKeys = Object.keys(settingsResources) as SettingsResourceKey[];
export const settingsScopeCapabilities = [
  "access.grant",
  "settings.manage",
  "privacy.manage",
  "claim.approve",
] as const;
export function isSettingsResource(value: string | null): boolean {
  return Object.values(settingsResources).some((id) => id === value);
}
