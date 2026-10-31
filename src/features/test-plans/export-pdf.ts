import { invoke } from "@tauri-apps/api/core";
import { generateProductCode } from "./product-code";
import { dataUrlToSvgString } from "@/lib/barcode-utils";
import { buildCasePdf, type PdfProductAsset } from "./pdf-document";
import { generationKey, safeImageUrl, type CaseContent } from "./model";

async function imageForPdf(
  url: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (!url || !safeImageUrl(url) || signal.aborted) return undefined;
  let dataUrl: string;
  try {
    dataUrl = await invoke<string>("fetch_test_product_image", { url });
  } catch {
    return undefined;
  }
  if (signal.aborted) return undefined;
  return new Promise((resolve) => {
    const image = new Image();
    let done = false;
    const finish = (value?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      image.onload = image.onerror = null;
      image.src = "";
      resolve(value);
    };
    const abort = () => finish();
    const timer = setTimeout(() => finish(), 5000);
    signal.addEventListener("abort", abort, { once: true });
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      try {
        if (
          !image.naturalWidth ||
          image.naturalWidth * image.naturalHeight > 40_000_000
        )
          return finish();
        const ratio = Math.min(
          1,
          320 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) return finish();
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/png"));
      } catch {
        finish();
      }
    };
    image.onerror = () => finish();
    if (signal.aborted) finish();
    else image.src = dataUrl;
  });
}

export async function createCasePdf(
  source: CaseContent,
  projectName: string,
  signal: AbortSignal,
  onProgress: (message: string) => void,
  codesOnly = false,
) {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/fonts/Roboto"),
  ]);
  pdfMake.addFontContainer(fonts);
  const products = source.lists.flatMap((list) => list.products);
  const assets = new Map<string, PdfProductAsset>();
  const codes = new Map<string, Promise<PdfProductAsset>>();
  const images = new Map<string, Promise<string | undefined>>();
  let next = 0,
    complete = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, products.length) }, async () => {
      while (next < products.length) {
        signal.throwIfAborted();
        const product = products[next++],
          key = generationKey(product);
        if (!codes.has(key))
          codes.set(
            key,
            generateProductCode(product)
              .then((result): PdfProductAsset =>
                result.dataUrl.startsWith("data:image/svg+xml")
                  ? { svg: dataUrlToSvgString(result.dataUrl) }
                  : { png: result.dataUrl },
              )
              .catch((error): PdfProductAsset => ({
                error: String(error instanceof Error ? error.message : error),
              })),
          );
        if (!codesOnly && !images.has(product.imageUrl))
          images.set(product.imageUrl, imageForPdf(product.imageUrl, signal));
        const [code, image] = await Promise.all([
          codes.get(key)!,
          codesOnly ? undefined : images.get(product.imageUrl)!,
        ]);
        signal.throwIfAborted();
        assets.set(product.id, { ...code, image });
        onProgress(
          `Preparing PDF: ${++complete} of ${products.length} entries`,
        );
      }
    }),
  );
  signal.throwIfAborted();
  onProgress("Building PDF pages…");
  const buffer = await pdfMake
    .createPdf(buildCasePdf(source, projectName, assets, codesOnly))
    .getBuffer();
  signal.throwIfAborted();
  return {
    buffer,
    unavailableImages: codesOnly
      ? 0
      : products.filter(
          (product) => product.imageUrl && !assets.get(product.id)?.image,
        ).length,
    failedCodes: products.filter((product) => assets.get(product.id)?.error)
      .length,
  };
}
