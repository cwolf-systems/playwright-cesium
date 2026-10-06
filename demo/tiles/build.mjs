// Writes the demo's 3D Tiles tileset: a block of boxes two kilometres across, as 3D Tiles 1.1 with
// glTF content. A coarse root tile refines into four detailed children, so loading the block takes
// several requests and exercises Cesium's refinement. The output is deterministic and committed;
// run again only to change it.
//   node demo/tiles/build.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('.', import.meta.url));

/** Half the block's width, in metres. */
const HALF = 1_000;
/** Geometric error of the coarse root, in metres: enough to refine from a few kilometres away. */
const ROOT_ERROR = 400;
/** Boxes along each side of a child tile. */
const PER_SIDE = 6;
const ROOT_COLOUR = [0.55, 0.57, 0.6, 1];
const CHILD_COLOURS = [
  [0.84, 0.75, 0.6, 1],
  [0.7, 0.78, 0.86, 1],
  [0.82, 0.68, 0.66, 1],
  [0.72, 0.82, 0.7, 1],
];

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

// Faces of a unit box: normal, then four corners, in glTF's y-up axes (x east, y up, z south).
const FACES = [
  [
    [1, 0, 0],
    [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  ],
  [
    [-1, 0, 0],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  ],
  [
    [0, 1, 0],
    [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  ],
  [
    [0, -1, 0],
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  ],
  [
    [0, 0, 1],
    [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
  ],
  [
    [0, 0, -1],
    [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  ],
];

/** One mesh of boxes, each `{ x, z, width, depth, height }` in metres, as a binary glTF. */
function glb(boxes, colour) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const { x, z, width, depth, height } of boxes) {
    for (const [normal, corners] of FACES) {
      const base = positions.length / 3;
      for (const [cx, cy, cz] of corners) {
        positions.push(x + cx * width, cy * height, z + cz * depth);
        normals.push(...normal);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const min = [0, 1, 2].map((axis) => Math.min(...positions.filter((_, i) => i % 3 === axis)));
  const max = [0, 1, 2].map((axis) => Math.max(...positions.filter((_, i) => i % 3 === axis)));

  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const normalBytes = Buffer.from(new Float32Array(normals).buffer);
  const indexBytes = Buffer.from(new Uint16Array(indices).buffer);
  const indexPadding = Buffer.alloc((4 - (indexBytes.length % 4)) % 4);
  const bin = Buffer.concat([positionBytes, normalBytes, indexBytes, indexPadding]);

  const gltf = {
    asset: { version: '2.0', generator: 'playwright-cesium demo' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [
      { pbrMetallicRoughness: { baseColorFactor: colour, metallicFactor: 0, roughnessFactor: 1 } },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: ARRAY_BUFFER },
      {
        buffer: 0,
        byteOffset: positionBytes.length,
        byteLength: normalBytes.length,
        target: ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: positionBytes.length + normalBytes.length,
        byteLength: indexBytes.length,
        target: ELEMENT_ARRAY_BUFFER,
      },
    ],
    accessors: [
      { bufferView: 0, componentType: FLOAT, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: FLOAT, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: UNSIGNED_SHORT, count: indices.length, type: 'SCALAR' },
    ],
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);

  const header = Buffer.alloc(12);
  const length = 12 + 8 + jsonChunk.length + 8 + bin.length;
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(length, 8);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([header, chunk(JSON_CHUNK, jsonChunk), chunk(BIN_CHUNK, bin)]);
}

/** A deterministic height for a box, so the block looks built rather than flat. */
const heightAt = (i, j) => 20 + ((i * 7 + j * 13) % 9) * 15;

/** A 3D Tiles box bounding volume: centre, then three half-axes, in the tile's z-up frame. */
// prettier-ignore
const box = (cx, cy, halfX, halfY, height) => [
  cx, cy, height / 2,
  halfX, 0, 0,
  0, halfY, 0,
  0, 0, height / 2,
];

const quadrants = [
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
];

const children = quadrants.map(([sx, sy], index) => {
  const originX = sx < 0 ? -HALF : 0;
  const originNorth = sy < 0 ? -HALF : 0;
  const cell = HALF / PER_SIDE;
  const boxes = [];
  for (let i = 0; i < PER_SIDE; i++) {
    for (let j = 0; j < PER_SIDE; j++) {
      boxes.push({
        x: originX + i * cell + cell * 0.15,
        // glTF's z points south; the tile's y points north.
        z: -(originNorth + (j + 1) * cell - cell * 0.15),
        width: cell * 0.7,
        depth: cell * 0.7,
        height: heightAt(index * PER_SIDE + i, j),
      });
    }
  }
  const name = `block-${index}.glb`;
  writeFileSync(`${OUT}${name}`, glb(boxes, CHILD_COLOURS[index]));
  return {
    boundingVolume: {
      box: box(originX + HALF / 2, originNorth + HALF / 2, HALF / 2, HALF / 2, 160),
    },
    geometricError: 0,
    content: { uri: name },
  };
});

writeFileSync(
  `${OUT}root.glb`,
  glb(
    quadrants.map(([sx, sy]) => ({
      x: sx < 0 ? -HALF : 0,
      z: -(sy < 0 ? 0 : HALF),
      width: HALF * 0.96,
      depth: HALF * 0.96,
      height: 60,
    })),
    ROOT_COLOUR,
  ),
);

writeFileSync(
  `${OUT}tileset.json`,
  `${JSON.stringify(
    {
      asset: { version: '1.1' },
      geometricError: ROOT_ERROR * 2,
      root: {
        boundingVolume: { box: box(0, 0, HALF, HALF, 160) },
        geometricError: ROOT_ERROR,
        refine: 'REPLACE',
        content: { uri: 'root.glb' },
        children,
      },
    },
    null,
    2,
  )}\n`,
);
console.log('wrote tileset.json, root.glb and four block tiles');
