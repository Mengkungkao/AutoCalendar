import sharp from "sharp";
import type { RosterImage } from "./readers/shared";

/**
 * Makes any accepted upload (up to 10 MB) fit what the readers take: turned
 * upright from the photo's EXIF orientation, scaled to the most detail the
 * models use (2576 px long edge, about 3.5 megapixels), and small enough for
 * Claude's 5 MB-per-image limit (which counts the base64 text, so 3.75 MB of
 * image). A screenshot that already fits is passed through untouched.
 */

const MAX_EDGE = 2576;
const MAX_PIXELS = 3_500_000;
export const MAX_MODEL_IMAGE_BYTES = 3_750_000;

type Metadata = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

export class UnreadableImageError extends Error {}

export async function normalizeImage(data: Uint8Array): Promise<RosterImage> {
  let meta: Metadata;
  try {
    meta = await sharp(data).metadata();
  } catch {
    throw new UnreadableImageError("This file can't be opened as an image. Use a PNG, JPG or HEIC.");
  }
  const turned = (meta.orientation ?? 1) >= 5; // EXIF orientations 5–8 swap width and height
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  if (!width || !height) throw new UnreadableImageError("This file can't be opened as an image.");
  if (width < 200 || height < 200) throw new UnreadableImageError("This image is too small to read.");

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  const upright = (meta.orientation ?? 1) === 1;
  if (meta.format === "png" && scale === 1 && upright && data.length <= MAX_MODEL_IMAGE_BYTES) {
    return { data, mediaType: "image/png" };
  }

  const pipeline = () => {
    const image = sharp(data).rotate();
    return scale < 1 ? image.resize(Math.round(width * scale), Math.round(height * scale), { fit: "fill" }) : image;
  };
  try {
    if (meta.format === "png") {
      const png = await pipeline().png({ compressionLevel: 9 }).toBuffer();
      if (png.length <= MAX_MODEL_IMAGE_BYTES) return { data: new Uint8Array(png), mediaType: "image/png" };
    }
    for (const quality of [90, 80, 65]) {
      const jpeg = await pipeline().flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
      if (jpeg.length <= MAX_MODEL_IMAGE_BYTES) return { data: new Uint8Array(jpeg), mediaType: "image/jpeg" };
    }
  } catch {
    throw new UnreadableImageError("This image couldn't be prepared. Try a screenshot instead.");
  }
  throw new UnreadableImageError("This image has too much detail to send. Try a screenshot instead.");
}
