/** Unknown or diagnostic phases cannot run an application, migration, queue or email send. */
export const stagingWorkAllowed = (phase: unknown) => phase === "false";
