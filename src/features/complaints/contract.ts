export const complaintFields = {
  create: [
    "channel",
    "sourceReference",
    "description",
    "receivedAt",
    "ownerId",
    "dueAt",
    "reviewed",
  ],
  review: ["ownerId", "dueAt", "state", "note", "outcome", "reviewed"],
} as const;
export type ComplaintCommand = keyof typeof complaintFields;
export const complaintScope = (command: ComplaintCommand, id: string) =>
  `complaint.${command}:${id}`;
