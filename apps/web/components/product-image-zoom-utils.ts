import type { CSSProperties } from "react";

export function productImageLensStyle({
  left,
  top,
  backgroundX,
  backgroundY,
  backgroundImage,
  zoom,
}: {
  left: number;
  top: number;
  backgroundX: number;
  backgroundY: number;
  backgroundImage: string;
  zoom: number;
}): CSSProperties {
  return {
    left,
    top,
    backgroundImage: `url("${backgroundImage}")`,
    backgroundPosition: `${backgroundX}% ${backgroundY}%`,
    backgroundSize: `${zoom * 100}%`,
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
