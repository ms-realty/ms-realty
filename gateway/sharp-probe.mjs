// Diagnostic only: compare the application's pinned Sharp in Node and local workerd.
// This entry point has no deploy routes, credentials, storage or application data.
import sharp from "sharp";

export default {
  async fetch() {
    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL7sAAAAASUVORK5CYII=",
      "base64",
    );
    const measured = await sharp(pixel, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
      pages: 1,
    }).metadata();
    return Response.json({ width: measured.width, height: measured.height });
  },
};
