import { useState } from "react";
import { ImageOff } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { safeImageUrl } from "./model";

export function ProductImage({
  src,
  title,
  thumbnail = false,
  zoomable = false,
}: {
  src: string;
  title: string;
  thumbnail?: boolean;
  zoomable?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const image = (
    <span className={thumbnail ? "tp-thumbnail" : "tp-product-image"}>
      {src && safeImageUrl(src) && failed !== src ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        <span
          role="img"
          aria-label={src ? "Image unavailable" : "No product image"}
        >
          <ImageOff aria-hidden="true" size={thumbnail ? 18 : 32} />
          {!thumbnail && (
            <small>{src ? "Image unavailable" : "No product image"}</small>
          )}
        </span>
      )}
    </span>
  );
  if (!zoomable || !src || !safeImageUrl(src) || failed === src) return image;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="tp-image-zoom" aria-label={`View larger image: ${title || "Product"}`}>
          {image}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogTitle className="pr-6 break-words">{title || "Product image"}</DialogTitle>
        <DialogDescription className="sr-only">Enlarged product image. Press Escape to close.</DialogDescription>
        <div className="tp-image-popup">
          <img src={src} alt={title || "Product image"} referrerPolicy="no-referrer" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
