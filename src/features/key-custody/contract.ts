export const custodyFields = {
  receive: [
    "propertyReference",
    "keyTag",
    "quantity",
    "sourceReference",
    "storageLabel",
    "note",
    "reviewed",
  ],
  move: ["state", "holderId", "dueAt", "storageLabel", "note", "reviewed"],
} as const;
export type CustodyCommand = keyof typeof custodyFields;
export const custodyScope = (command: CustodyCommand, id: string) => `key.${command}:${id}`;
