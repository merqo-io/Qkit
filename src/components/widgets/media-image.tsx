import Image, { type ImageProps } from "next/image";

/**
 * next/image wrapper that renders SVG sources without the global
 * `dangerouslyAllowSVG` flag by marking only `.svg` URLs as unoptimized.
 * Raster images (vendor uploads) still get full optimization.
 */
export function MediaImage(props: ImageProps) {
  const isSvg = typeof props.src === "string" && props.src.endsWith(".svg");
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is forwarded through the spread props
  return <Image {...props} unoptimized={isSvg || !!props.unoptimized} />;
}
