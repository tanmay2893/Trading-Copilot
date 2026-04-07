import React from "react";

export type BoldSegment = { type: "text" | "bold"; content: string };

/**
 * Split on markdown **bold** (double asterisks). Unclosed ** is left as literal text.
 */
export function splitBoldSegments(text: string): BoldSegment[] {
  if (!text) return [];
  const out: BoldSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("**", i);
    if (start === -1) {
      out.push({ type: "text", content: text.slice(i) });
      break;
    }
    if (start > i) {
      out.push({ type: "text", content: text.slice(i, start) });
    }
    const end = text.indexOf("**", start + 2);
    if (end === -1) {
      out.push({ type: "text", content: text.slice(start) });
      break;
    }
    const inner = text.slice(start + 2, end);
    out.push({ type: "bold", content: inner });
    i = end + 2;
  }
  return out;
}

/**
 * Renders **bold** in assistant/user chat text. Preserves whitespace (caller sets layout).
 */
export function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode {
  const chunks = splitBoldSegments(text);
  if (chunks.length === 0) return null;
  if (chunks.length === 1 && chunks[0].type === "text") {
    return chunks[0].content;
  }
  return (
    <>
      {chunks.map((chunk, i) => {
        const k = `${keyPrefix}-${i}`;
        if (chunk.type === "bold") {
          return (
            <strong key={k} className="font-semibold">
              {chunk.content}
            </strong>
          );
        }
        return <React.Fragment key={k}>{chunk.content}</React.Fragment>;
      })}
    </>
  );
}
