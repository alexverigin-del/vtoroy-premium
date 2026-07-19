import type { ReactNode } from "react";
import type { RichTextNode } from "@vtoroy/shared";

import { cn } from "../lib/cn";

type RichTextProps = {
  html: string;
  nodes?: RichTextNode[];
  className?: string;
};

function renderNode(node: RichTextNode, key: number): ReactNode {
  if (node.type === "text") return node.text;

  const children = node.children.map(renderNode);

  switch (node.tag) {
    case "p":
      return <p key={key}>{children}</p>;
    case "br":
      return <br key={key} />;
    case "strong":
      return <strong key={key}>{children}</strong>;
    case "b":
      return <b key={key}>{children}</b>;
    case "em":
      return <em key={key}>{children}</em>;
    case "i":
      return <i key={key}>{children}</i>;
    case "ul":
      return <ul key={key}>{children}</ul>;
    case "ol":
      return <ol key={key}>{children}</ol>;
    case "li":
      return <li key={key}>{children}</li>;
    case "h2":
      return <h2 key={key}>{children}</h2>;
    case "h3":
      return <h3 key={key}>{children}</h3>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "a":
      return (
        <a
          href={node.href}
          key={key}
          rel={node.openInNew ? "noopener noreferrer" : undefined}
          target={node.openInNew ? "_blank" : undefined}
        >
          {children}
        </a>
      );
  }
}

export function RichText({ html, nodes, className }: RichTextProps) {
  if (!html) return null;

  return (
    <div
      className={cn(
        "[&_a]:font-medium [&_a]:text-link-blue [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-8 [&_blockquote]:border-l-2 [&_blockquote]:border-link-blue [&_blockquote]:pl-6 [&_blockquote]:text-xl [&_blockquote]:leading-relaxed [&_h2]:mt-12 [&_h2]:text-3xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h3]:mt-8 [&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:leading-tight [&_li]:pl-1 [&_ol]:mt-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p+p]:mt-5 [&_strong]:font-semibold [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:pl-6",
        className,
      )}
      data-component="RichText"
    >
      {nodes?.length ? nodes.map(renderNode) : html}
    </div>
  );
}
