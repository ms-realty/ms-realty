"use client";

import { type ReactNode, useEffect, useState } from "react";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import { NativeForm } from "@/ui/form/native-form";

/** Native controls send the active editor's text through its leave check. Once enhanced,
 * the existing separate forms let MediaReviewGuard ask before leaving that editor. */
export function MediaPlacementControls({
  formId,
  action,
  path,
  relationId,
  hidden,
  version,
  operationId,
  options,
  copy,
  moves,
}: {
  formId?: string;
  action: string;
  path: string;
  relationId: string;
  hidden: boolean;
  version: number;
  operationId: string;
  options: { id: string; label: string }[];
  copy: { hide: string; show: string; position: string; choosePosition: string; review: string };
  moves: ReactNode;
}) {
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  const native = !enhanced && formId;
  const position = (
    <div className="grid min-w-0 flex-1 gap-2">
      <label className={labelClass} htmlFor="media-position">
        {copy.position}
      </label>
      <select
        id="media-position"
        name={native ? "_before" : "before"}
        form={native || undefined}
        required
        defaultValue=""
        className={controlClass}
      >
        <option value="">{copy.choosePosition}</option>
        {options.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {moves}
        {native ? (
          <>
            <input form={native} type="hidden" name="_placementRevision" value={version} />
            <input form={native} type="hidden" name="_placementOperationId" value={operationId} />
            <button
              form={native}
              type="submit"
              name="_mediaHidden"
              value={String(!hidden)}
              className={buttonClass("tertiary")}
            >
              {hidden ? copy.show : copy.hide}
            </button>
          </>
        ) : (
          <NativeForm action={action} method="post">
            <input type="hidden" name="intent" value="place" />
            <input type="hidden" name="operationId" value={operationId} />
            <input type="hidden" name="expectedRevision" value={version} />
            <input type="hidden" name="relationId" value={relationId} />
            <input type="hidden" name="hidden" value={String(!hidden)} />
            <button type="submit" className={buttonClass("tertiary")}>
              {hidden ? copy.show : copy.hide}
            </button>
          </NativeForm>
        )}
      </div>
      {options.length > 1 ? (
        native ? (
          <div className="flex flex-wrap items-end gap-2">
            {position}
            <button
              form={native}
              type="submit"
              name="_leave"
              value="position"
              className={buttonClass("secondary")}
            >
              {copy.review}
            </button>
          </div>
        ) : (
          <form method="get" action={path} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="photo" value={relationId} />
            {position}
            <button type="submit" className={buttonClass("secondary")}>
              {copy.review}
            </button>
          </form>
        )
      ) : null}
    </>
  );
}
