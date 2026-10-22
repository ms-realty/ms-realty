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
  amend_deadline: ["dueAt", "note", "reviewed"],
} as const;
export type CustodyCommand = keyof typeof custodyFields;
export const custodyScope = (command: CustodyCommand, id: string) => `key.${command}:${id}`;
