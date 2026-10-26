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
    // Transparent: drop the panel's own background and border in the copy only.
    style: { background: "transparent", border: "none", boxShadow: "none" },
  }).then((blob) => {
    if (!blob) throw new Error("Couldn't draw the image.");
    return blob;
  });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
