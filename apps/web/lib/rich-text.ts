import "server-only";

import type { RichTextNode, RichTextTag } from "@vtoroy/shared";
import { parseDocument } from "htmlparser2";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a"];

export function sanitizeRichText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";

  return sanitizeHtml(value, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attributes) => {
        const href = attributes.href?.trim();
        const opensNewWindow = attributes.target === "_blank";

        return {
          tagName: "a",
          attribs: {
            ...(href ? { href } : {}),
            ...(opensNewWindow ? { target: "_blank", rel: "noopener noreferrer" } : {}),
          },
        };
      },
    },
  });
}

type HtmlNode = ReturnType<typeof parseDocument>["children"][number];

function toRichTextNode(node: HtmlNode): RichTextNode | null {
  if (node.type === "text") {
    return node.data ? { type: "text", text: node.data } : null;
  }

  if (node.type !== "tag" || !ALLOWED_TAGS.includes(node.name)) return null;

  return {
    type: "element",
    tag: node.name as RichTextTag,
    children: node.children
      .map((child) => toRichTextNode(child))
      .filter((child): child is RichTextNode => child !== null),
    ...(node.name === "a" && node.attribs.href ? { href: node.attribs.href } : {}),
    ...(node.name === "a" && node.attribs.target === "_blank" ? { openInNew: true } : {}),
  };
}

export function prepareRichText(value: unknown): { html: string; nodes: RichTextNode[] } {
  const html = sanitizeRichText(value);
  if (!html) return { html: "", nodes: [] };

  const document = parseDocument(html, { decodeEntities: true });
  return {
    html,
    nodes: document.children
      .map((node) => toRichTextNode(node))
      .filter((node): node is RichTextNode => node !== null),
  };
}
