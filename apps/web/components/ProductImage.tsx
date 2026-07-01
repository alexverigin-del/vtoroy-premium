import Image, { type ImageProps } from "next/image";

type ProductImageProps = Omit<ImageProps, "src" | "alt"> & {
  src: string;
  alt?: string;
};

export function productImageSrc(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `/${path}`;
}

export function ProductImage({ src, alt = "", ...props }: ProductImageProps) {
  const normalizedSrc = productImageSrc(src);
  if (!normalizedSrc) return null;

  return <Image src={normalizedSrc} alt={alt} {...props} />;
}
