import type { ReactNode } from "react";
import { type ContentBody, contentParagraphs } from "@/domain/content-body";
import { ContentPlaintext } from "./plaintext";

/** P15/P16 / O21: public and reviewer previews render the same bounded, escaped composition. */
export function ContentBodyView({
  body,
  headingLevel = 2,
}: {
  body: ContentBody;
  headingLevel?: 2 | 4;
}) {
  if (!("blocks" in body))
    return (
      <>
        {contentParagraphs(body).map((paragraph, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: immutable edition position, no local state
          <p key={index} className="whitespace-pre-wrap break-words">
            <ContentPlaintext text={paragraph} />
          </p>
        ))}
      </>
    );
  const nodes: ReactNode[] = [];
  const Heading = headingLevel === 2 ? "h2" : "h4";
  for (let index = 0; index < body.blocks.length; index += 1) {
    const block = body.blocks[index];
    if (!block) continue;
    if (block.type === "step") {
      const steps = [block];
      while (body.blocks[index + 1]?.type === "step") {
        index += 1;
        const next = body.blocks[index];
        if (next?.type === "step") steps.push(next);
      }
      nodes.push(
        <ol key={index} className="list-decimal space-y-5 ps-6 marker:font-semibold">
          {steps.map((step, position) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: immutable process step order
            <li key={position} className="min-w-0 space-y-2 break-words ps-2">
              <strong className="block">
                <ContentPlaintext text={step.title} />
              </strong>
              <p className="whitespace-pre-wrap">
                <ContentPlaintext text={step.text} />
              </p>
            </li>
          ))}
        </ol>,
      );
    } else if (block.type === "heading")
      nodes.push(
        <Heading key={index} className="break-words pt-4 text-subheading font-semibold">
          <ContentPlaintext text={block.text} />
        </Heading>,
      );
    else if (block.type === "paragraph")
      nodes.push(
        <p key={index} className="whitespace-pre-wrap break-words">
          <ContentPlaintext text={block.text} />
        </p>,
      );
    else if (block.type === "list")
      nodes.push(
        <ul key={index} className="list-disc space-y-2 ps-6">
          {block.items.map((item, position) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: immutable list item order
            <li key={position} className="break-words">
              <ContentPlaintext text={item} />
            </li>
          ))}
        </ul>,
      );
    else if (block.type === "callout")
      nodes.push(
        <aside key={index} className="min-w-0 space-y-2 rounded-panel border border-border p-5">
          <strong className="block break-words">
            <ContentPlaintext text={block.title} />
          </strong>
          <p className="whitespace-pre-wrap break-words">
            <ContentPlaintext text={block.text} />
          </p>
        </aside>,
      );
    else
      nodes.push(
        <p key={index} className="break-words">
          <a
            href={block.href}
            className="inline-flex min-h-control items-center underline underline-offset-4 [overflow-wrap:anywhere]"
          >
            <ContentPlaintext text={block.text} />
          </a>
        </p>,
      );
  }
  return <>{nodes}</>;
}
