// Synthetic, one-tile PMTiles v3 archive. This verifies the actual reader/WebGL path, not geography.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fromGeojsonVt } from "@maplibre/vt-pbf";

const varint = (n) => {
  const bytes = [];
  while (n > 127) {
    bytes.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  bytes.push(n);
  return bytes;
};
const tile = Buffer.from(
  fromGeojsonVt({
    water: {
      features: [
        {
          id: 1,
          type: 3,
          tags: { kind: "water" },
          geometry: [
            [
              [0, 0],
              [4096, 0],
              [4096, 4096],
              [0, 4096],
              [0, 0],
            ],
          ],
        },
      ],
    },
  }),
);
const directory = Buffer.from([1, 0, 1, ...varint(tile.length), 1]);
const metadata = Buffer.from(
  JSON.stringify({ name: "Synthetic map test only", vector_layers: [{ id: "water", fields: {} }] }),
);
const header = Buffer.alloc(127);
header.write("PMTiles");
header[7] = 3;
for (const [offset, value] of [
  [8, 127],
  [16, directory.length],
  [24, 127 + directory.length],
  [32, metadata.length],
  [56, 127 + directory.length + metadata.length],
  [64, tile.length],
  [72, 1],
  [80, 1],
  [88, 1],
])
  header.writeBigUInt64LE(BigInt(value), offset);
header[96] = 1;
header[97] = 1;
header[98] = 1;
header[99] = 1;
header.writeInt32LE(-1800000000, 102);
header.writeInt32LE(-850000000, 106);
header.writeInt32LE(1800000000, 110);
header.writeInt32LE(850000000, 114);
const archive = Buffer.concat([header, directory, metadata, tile]);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
const files = {
  "basemap.pmtiles": archive,
  "sprites/light.json": Buffer.from("{}"),
  "sprites/light@2x.json": Buffer.from("{}"),
  "sprites/light.png": png,
  "sprites/light@2x.png": png,
};
export const mapFixtureRelease = createHash("sha256")
  .update(
    Buffer.concat(Object.entries(files).flatMap(([name, bytes]) => [Buffer.from(name), bytes])),
  )
  .digest("hex");
export async function writeMapFixture() {
  for (const [name, bytes] of Object.entries(files)) {
    const target = new URL(`../../public/maps/${mapFixtureRelease}/${name}`, import.meta.url);
    await mkdir(new URL(".", target), { recursive: true });
    await writeFile(target, bytes);
  }
}
