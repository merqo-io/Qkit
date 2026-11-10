"use client";

import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@merqo/ui/primitives";

import { MediaImage } from "@/components/widgets/media-image";

interface Props {
  src: string;
  alt: string;
  sizes?: string;
}

/**
 * A menu photo that opens fullscreen on tap. The corner expand icon +
 * zoom-in cursor are the affordance that it's enlargeable; tap the backdrop or
 * press Escape to close.
 */
export function ZoomableImage({ src, alt, sizes }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge photo of ${alt || "this item"}`}
        className="group absolute inset-0 cursor-zoom-in"
      >
        <MediaImage
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? "4rem"}
          className="object-cover"
        />
        <span className="absolute right-1 top-1 rounded-md bg-background/70 p-0.5 text-foreground/80 opacity-90 shadow-sm backdrop-blur-sm transition group-hover:opacity-100">
          <Maximize2 className="size-3" />
        </span>
      </button>

      <DialogContent
        showCloseButton={false}
        className="inset-0 flex h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none border-none bg-transparent p-4 shadow-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">{alt || "Enlarged photo"}</DialogTitle>
        <DialogClose
          aria-label="Close"
          className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <X className="size-5" />
        </DialogClose>
        <div className="relative h-[80vh] w-full max-w-2xl">
          <MediaImage
            src={src}
            alt={alt}
            fill
            sizes="90vw"
            className="object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
