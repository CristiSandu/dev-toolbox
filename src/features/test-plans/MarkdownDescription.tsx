import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { safeMarkdownUrl } from "./model";
import { ProductImage } from "./ProductImage";

export function MarkdownDescription({ source }: { source: string }) {
  return (
    <div className="tp-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, key) => safeMarkdownUrl(url, key === "src")}
        components={{
          a: ({ href, children }) => (
            <a
              href={href || undefined}
              target={href?.startsWith("#") ? undefined : "_blank"}
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!href) {
                  event.preventDefault();
                  return;
                }
                if (isTauri() && !href.startsWith("#")) {
                  event.preventDefault();
                  void openUrl(href).catch(() =>
                    toast.error("Could not open this link"),
                  );
                }
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <ProductImage
              zoomable
              src={typeof src === "string" ? src : ""}
              title={alt || "Description image"}
            />
          ),
          table: ({ children }) => (
            <div className="tp-table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
