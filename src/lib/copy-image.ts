import { toBlob } from "html-to-image";

/**
 * Copies an element to the clipboard as a PNG with a transparent background.
 * Desktop Chrome, Edge, and Safari. The image is drawn in the browser from
 * the page itself, so nothing is uploaded anywhere.
 *
 * The blob is passed to ClipboardItem as a promise so Safari still counts the
 * copy as part of the click (it rejects clipboard writes after an await).
 */
export async function copyElementAsImage(el: HTMLElement): Promise<void> {
  const png = toBlob(el, {
    pixelRatio: 2, // sharp on high-DPI screens and in Discord's zoom view
    cacheBust: false,
    // Every image here is "/_next/image?url=...". Without this the library
    // caches by path alone, so all candies and avatars become the first one.
    includeQueryParams: true,
    // Transparent: drop the panel's own background and border in the copy only.
    style: { background: "transparent", border: "none", boxShadow: "none" },
  }).then((blob) => {
    if (!blob) throw new Error("Couldn't draw the image.");
    return blob;
  });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/**
 * Downloads an element as a PNG at an exact output size (e.g. the background
 * image's native 1672×941), whatever size it's shown at on screen.
 */
export async function downloadElementAsPng(el: HTMLElement, fileName: string, outputWidth: number, outputHeight: number): Promise<void> {
  const blob = await toBlob(el, {
    pixelRatio: 1,
    canvasWidth: outputWidth,
    canvasHeight: outputHeight,
    cacheBust: false,
    includeQueryParams: true, // see copyElementAsImage
  });
  if (!blob) throw new Error("Couldn't draw the image.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copies an image file from the site (e.g. /assets/orangebar.png) to the clipboard as a PNG. */
export async function copyImageFile(path: string): Promise<void> {
  const png = fetch(path).then(async (res) => {
    if (!res.ok) throw new Error(`Couldn't load ${path}.`);
    const blob = await res.blob();
    if (blob.type === "image/png") return blob;
    // Clipboards only take PNG: convert anything else through a canvas.
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't convert the image."))), "image/png"));
  });
  // Passed as a promise so Safari still counts it as part of the click.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
