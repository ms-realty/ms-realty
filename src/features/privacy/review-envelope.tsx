"use client";
// C-11: a privacy review keeps the operation and the version it was reviewed against. The
// private-page guard refreshes the server render when the tab becomes visible again; a fresh
// envelope there would let a dirty review submit against a version its operator never saw.
// Pinned here, a newer version answers with a conflict and nothing is written.
import { useState } from "react";

export function ReviewEnvelope(props: { id: string; version: number; operationId: string }) {
  const [review] = useState(props);
  return (
    <>
      <input type="hidden" name="intent" value="review" />
      <input type="hidden" name="operationId" value={review.operationId} />
      <input type="hidden" name="id" value={review.id} />
      <input type="hidden" name="expectedVersion" value={review.version} />
    </>
  );
}
