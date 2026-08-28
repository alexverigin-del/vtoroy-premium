import type { CSSProperties } from "react";

export function productImageLensStyle({
  left,
  top,
  backgroundWidth,
  backgroundHeight,
  backgroundLeft,
  backgroundTop,
  backgroundImage,
}: {
  left: number;
  top: number;
  backgroundWidth: number;
  backgroundHeight: number;
  backgroundLeft: number;
  backgroundTop: number;
  backgroundImage: string;
}): CSSProperties {
  return {
    left,
    top,
    backgroundImage: `url("${backgroundImage}")`,
    backgroundPosition: `${backgroundLeft}px ${backgroundTop}px`,
    backgroundSize: `${backgroundWidth}px ${backgroundHeight}px`,
  };
}

export function productImageTransformStyle({
  x,
  y,
  scale,
}: {
  x: number;
  y: number;
  scale: number;
}): CSSProperties {
  return { transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})` };
}
