import { MAX_FILE_BYTES, formatMegabytes } from "./upload";

/**
 * Browser-side: turns the chosen file (up to 10 MB) into something the server
 * accepts. A PNG, JPG or WebP that fits the upload limit is sent as it is; the
 * server turns it upright and resizes it. Anything else (HEIC, or a file over
 * the limit, which on Vercel is 4.4 MB) is redrawn upright here and scaled to
 * what the readers use at full detail (2576 px long edge, ~3.5 megapixels).
 */

const MAX_EDGE = 2576;
const MAX_PIXELS = 3_500_000;

export class ImageError extends Error {}

export function isHeicFile(file: File): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError("This file can't be opened as an image."));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageError("The image couldn't be prepared."))), "image/jpeg", quality);
  });
}

/** @param uploadLimit the most the server can receive (4.4 MB on Vercel, 10 MB elsewhere). */
export async function prepareImage(file: File, uploadLimit: number): Promise<Blob> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageError(`This file is ${formatMegabytes(file.size)}; the limit is ${formatMegabytes(MAX_FILE_BYTES)}. Take a screenshot of the roster instead.`);
  }

  let image = await loadImage(file).catch(() => null);
  if (!image && isHeicFile(file)) {
    // iPhone Safari decodes HEIC itself; other browsers need a converter (loaded only now).
    const { heicTo } = await import("heic-to/next");
    const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 }).catch(() => null);
    if (!jpeg) throw new ImageError("This HEIC photo couldn't be converted. Take a screenshot of it and upload that instead.");
    image = await loadImage(jpeg);
  }
  if (!image) throw new ImageError("This file can't be opened as an image. Use a PNG, JPG or HEIC.");

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width < 200 || height < 200) throw new ImageError("This image is too small to read.");

  if (/^image\/(png|jpeg|webp)$/.test(file.type) && file.size <= uploadLimit) return file;

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("The image couldn't be prepared.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.9, 0.8, 0.65]) {
    const blob = await canvasToJpeg(canvas, quality);
    if (blob.size <= uploadLimit) return blob;
  }
  throw new ImageError("This image is too large to upload. Try a screenshot instead.");
}
