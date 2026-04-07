"use client";

import React from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { parseMathSegments, type MathSegment } from "@/lib/parseMath";
import { renderInlineMarkdown } from "@/lib/renderInlineMarkdown";

interface TextWithMathProps {
  content: string;
  className?: string;
}

function renderMathSegment(seg: MathSegment, key: number): React.ReactNode {
  if (seg.type === "text") {
    return (
      <span key={key} className="whitespace-pre-wrap">
        {renderInlineMarkdown(seg.content, `m${key}`)}
      </span>
    );
  }
  if (seg.type === "inline") {
    try {
      const html = katex.renderToString(seg.content.trim(), {
        displayMode: false,
        throwOnError: false,
        output: "html",
      });
      return (
        <span
          key={key}
          className="katex-inline align-baseline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch {
      return (
        <span key={key} className="opacity-80">
          \({seg.content}\)
        </span>
      );
    }
  }
  try {
    const html = katex.renderToString(seg.content.trim(), {
      displayMode: true,
      throwOnError: false,
      output: "html",
    });
    return (
      <div
        key={key}
        className="my-2 flex justify-center overflow-x-auto katex-display text-[var(--text-primary)]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <div key={key} className="my-2 text-center opacity-80">
        \[{seg.content}\]
      </div>
    );
  }
}

/** Renders a single line (may contain inline math). */
function renderLineWithMath(line: string, lineKey: number): React.ReactNode {
  const segments = parseMathSegments(line);
  if (segments.length === 0) return <div key={lineKey} />;
  if (segments.length === 1 && segments[0].type === "text") {
    return (
      <div key={lineKey} className="whitespace-pre-wrap">
        {renderInlineMarkdown(segments[0].content, `ln${lineKey}`)}
      </div>
    );
  }
  return (
    <div key={lineKey} className="whitespace-pre-wrap">
      {segments.map((seg, i) => renderMathSegment(seg, i))}
    </div>
  );
}

/** Renders text with block structure: newlines, ### headings, "1. " lists, "- " / "* " lists. */
function renderTextWithBlocks(text: string, baseKey: number): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let key = baseKey;

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul
          key={key++}
          className="list-disc list-inside pl-4 my-1 space-y-0.5 text-[inherit]"
        >
          {listItems.map((item, j) => (
            <li key={j}>{parseMathSegments(item).map((seg, i) => renderMathSegment(seg, i))}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const flushOrdered = () => {
    if (orderedItems.length > 0) {
      nodes.push(
        <ol
          key={key++}
          className="list-decimal list-inside pl-4 my-1 space-y-0.5 text-[inherit]"
        >
          {orderedItems.map((item, j) => (
            <li key={j}>{parseMathSegments(item).map((seg, i) => renderMathSegment(seg, i))}</li>
          ))}
        </ol>
      );
      orderedItems = [];
    }
  };

  const flushLists = () => {
    flushList();
    flushOrdered();
  };

  for (const line of lines) {
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);

    if (headingMatch) {
      flushLists();
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      const headingClass =
        level <= 1
          ? "text-base font-semibold text-[var(--text-primary)] mt-2 first:mt-0"
          : level === 2
            ? "text-sm font-semibold text-[var(--text-primary)] mt-2 first:mt-0"
            : "text-sm font-semibold text-[var(--text-primary)] mt-1.5 first:mt-0";
      const hk = key++;
      nodes.push(
        <div key={hk} className={headingClass}>
          {renderInlineMarkdown(title, `h${hk}`)}
        </div>
      );
      continue;
    }

    if (orderedMatch) {
      flushList();
      orderedItems.push(orderedMatch[1]);
      continue;
    }

    if (listMatch) {
      flushOrdered();
      listItems.push(listMatch[1]);
      continue;
    }

    flushLists();
    if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-2" aria-hidden />);
    } else {
      nodes.push(renderLineWithMath(line, key++));
    }
  }
  flushLists();
  return nodes;
}

export function TextWithMath({ content, className = "" }: TextWithMathProps) {
  const segments = parseMathSegments(content ?? "");

  if (segments.length === 0) return null;
  if (segments.length === 1 && segments[0].type === "text") {
    const text = segments[0].content;
    const needsBlockLayout =
      text.includes("\n") ||
      /^\s*[-*]\s+/m.test(text) ||
      /^\s*#{1,6}\s/m.test(text) ||
      /^\s*\d+\.\s/m.test(text);
    if (!needsBlockLayout) {
      return <span className={className}>{renderInlineMarkdown(text, "twm")}</span>;
    }
    return (
      <div className={`${className} space-y-1`}>
        {renderTextWithBlocks(text, 0)}
      </div>
    );
  }

  const hasDisplay = segments.some((s) => s.type === "display");

  return (
    <div className={`${className} space-y-1`}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          const sc = seg.content;
          const needsBlockLayout =
            sc.includes("\n") ||
            /^\s*[-*]\s+/m.test(sc) ||
            /^\s*#{1,6}\s/m.test(sc) ||
            /^\s*\d+\.\s/m.test(sc);
          if (needsBlockLayout) {
            return <React.Fragment key={i}>{renderTextWithBlocks(sc, i * 1000)}</React.Fragment>;
          }
          return (
            <span key={i} className="whitespace-pre-wrap block">
              {renderInlineMarkdown(sc, `seg${i}`)}
            </span>
          );
        }
        return renderMathSegment(seg, i);
      })}
    </div>
  );
}
