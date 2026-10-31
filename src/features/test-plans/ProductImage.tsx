import { useState } from "react";
import { ImageOff } from "lucide-react";
import { safeImageUrl } from "./model";

export function ProductImage({
  src,
  title,
  thumbnail = false,
}: {
  src: string;
  title: string;
  thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
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
}
