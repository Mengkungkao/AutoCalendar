import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_MODEL_IMAGE_BYTES, UnreadableImageError, normalizeImage } from "@/server/normalize-image";

const size = async (data: Uint8Array) => {
  const meta = await sharp(data).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
};

/** Random pixels don't compress, so this makes big files on purpose. */
function noise(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 3);
  let state = 2463534242;
  for (let index = 0; index < pixels.length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = state & 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}

describe("normalizeImage", () => {
  it("passes a screenshot that already fits through untouched", async () => {
    const png = new Uint8Array(readFileSync("tests/live/images/synthetic-roster.png"));
    const result = await normalizeImage(png);
    expect(result.mediaType).toBe("image/png");
    expect(result.data).toBe(png);
  });

  it("scales a large photo to the readers' limits and under Claude's size limit", async () => {
    const big = new Uint8Array(await noise(4032, 3024).jpeg({ quality: 95 }).toBuffer());
    expect(big.length).toBeGreaterThan(4_500_000); // bigger than Vercel could take, within the 10 MB limit
    const result = await normalizeImage(big);
    const out = await size(result.data);
    expect(result.mediaType).toBe("image/jpeg");
    expect(Math.max(out.width!, out.height!)).toBeLessThanOrEqual(2576);
    expect(out.width! * out.height!).toBeLessThanOrEqual(3_500_000);
    expect(result.data.length).toBeLessThanOrEqual(MAX_MODEL_IMAGE_BYTES);
  });

  it("re-encodes a PNG that is too heavy for Claude", async () => {
    const heavy = new Uint8Array(await noise(1800, 1500).png().toBuffer());
    expect(heavy.length).toBeGreaterThan(MAX_MODEL_IMAGE_BYTES);
    const result = await normalizeImage(heavy);
    expect(result.data.length).toBeLessThanOrEqual(MAX_MODEL_IMAGE_BYTES);
  });

  it("turns a sideways phone photo upright", async () => {
    // Stored 600×400 with EXIF orientation 6 (rotate 90°): it should come out 400×600.
    const sideways = new Uint8Array(await noise(600, 400).jpeg().withMetadata({ orientation: 6 }).toBuffer());
    const result = await normalizeImage(sideways);
    expect(await size(result.data)).toMatchObject({ width: 400, height: 600 });
  });

  it("rejects files that aren't images or are too small", async () => {
    await expect(normalizeImage(new TextEncoder().encode("not an image at all"))).rejects.toBeInstanceOf(UnreadableImageError);
    const tiny = new Uint8Array(await noise(100, 100).png().toBuffer());
    await expect(normalizeImage(tiny)).rejects.toThrow(/too small/);
  });
});
