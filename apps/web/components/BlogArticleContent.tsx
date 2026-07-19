import type { BlogPost } from "@vtoroy/shared";

import { ProductImage } from "@/components/ProductImage";
import { RichText } from "@/components/RichText";
import { cn } from "@/lib/cn";

export function BlogArticleContent({ post }: { post: BlogPost }) {
  const blocks = post.blocks.length
    ? post.blocks
    : [
        {
          id: `${post.id}-legacy-body`,
          type: "rich_text" as const,
          body: post.body,
          bodyRichText: post.bodyRichText,
        },
      ];

  return (
    <div className="pt-10 sm:pt-14">
      {blocks.map((block, index) => {
        const spacing = index ? "mt-10 sm:mt-14" : "";

        if (block.type === "rich_text") {
          return (
            <RichText
              key={block.id}
              html={block.body}
              nodes={block.bodyRichText}
              className={cn(
                "mx-auto max-w-measure px-5 text-lg leading-article text-carbon sm:px-8",
                spacing,
              )}
            />
          );
        }

        return (
          <figure
            key={block.id}
            className={cn(
              "mx-auto px-5 sm:px-8",
              block.width === "wide" ? "max-w-content" : "max-w-measure",
              spacing,
            )}
          >
            <ProductImage
              src={block.image}
              alt={block.alt}
              width={block.sourceWidth}
              height={block.sourceHeight}
              sizes={
                block.width === "wide"
                  ? "(max-width: 1199px) 100vw, 1120px"
                  : "(max-width: 799px) 100vw, 760px"
              }
              className="h-auto w-full rounded-card bg-surface"
            />
            {block.caption ? (
              <figcaption className="mt-3 text-sm leading-relaxed text-muted">
                {block.caption}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
