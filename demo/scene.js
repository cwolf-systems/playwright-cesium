// An offline mission scene from the cesium package alone: its bundled Natural Earth II imagery,
// seeded procedural terrain, and drones on altitude stems with their tracks, two geofences and
// labels. `?variant=` changes one thing:
//   subtle      the sun 20 s later, a fraction of a degree
//   shifted     the camera turned 0.05°, about a quarter of a pixel
//   regression  a drone gone and a geofence moved
//   faint       a geofence fill a little stronger and a track colour nudged
//
// `?webgl1` asks Cesium for a WebGL 1 context, for browsers whose WebGL 2 context fails, and
// `?requestRender` turns on Cesium's request-render mode, which renders only when asked. `?tiles`
// adds a 3D Tiles block of buildings (demo/tiles) on levelled ground and frames the camera on it,
// close enough that its root refines into its four children.
//
// For the loading cases the tests need: `?model` adds a textured glTF marker whose texture
// (marker.png) loads on its own, `?billboards` adds billboards with marker.png, with no image
// and with an image that fails to load, and `?terrainAfter=<ms>` creates the terrain that long after the viewer,
// through a `Terrain`.
//
// It marks the body data-unsupported with the reason where Cesium cannot start in this browser
// (no WebGL, or a browser API it needs), data-error on any other failure, and data-ready once the
// globe and entities have stayed loaded for several frames. playwright-cesium's own settling
// replaces that marker in the tests that exercise it.

const params = new URLSearchParams(window.location.search);
const variant = params.get('variant');

const TIME = '2026-06-21T14:00:00Z';
const SUBTLE_SECONDS = 20;
const SHIFT_DEGREES = 0.05;
const CAMERA = { lon: -116.2, lat: 43.08, height: 30_000, heading: 6, pitch: -40 };

const TERRAIN_SAMPLES = 33;
// Within the heights Cesium expects of real terrain here (ApproximateTerrainHeights): ground
// clamped polygons are drawn as volumes sized from that table, and break over higher terrain.
const BASE_HEIGHT = 700;
const RELIEF = 2_600;
const STEM_HEIGHT = 450;
const STABLE_FRAMES = 10;

// The 3D Tiles block: where it stands, the ground levelled around it, and the camera on it.
const BLOCK = { lon: -116.2, lat: 43.45 };
const LEVEL_INNER_DEGREES = 0.02;
const LEVEL_OUTER_DEGREES = 0.04;
const MARKER = { lon: -116.26, lat: 43.44, size: 1_500, above: 30 };

const BLOCK_CAMERA = { lon: -116.2, lat: 43.426, aboveBlock: 1_500, heading: 0, pitch: -30 };

// Deterministic value noise over degrees, so every run builds the same terrain.
function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const relief = (lon, lat) =>
  BASE_HEIGHT +
  RELIEF *
    (0.5 * noise(lon * 9, lat * 9) +
      0.3 * noise(lon * 25, lat * 25) +
      0.2 * noise(lon * 70, lat * 70));

const blockHeight = relief(BLOCK.lon, BLOCK.lat);

/** Terrain height; with `?tiles`, flat under the block and blending back to the relief around it. */
function ground(lon, lat) {
  const height = relief(lon, lat);
  if (!params.has('tiles')) return height;
  const distance = Math.hypot(lon - BLOCK.lon, lat - BLOCK.lat);
  const t = Math.min(
    Math.max((distance - LEVEL_INNER_DEGREES) / (LEVEL_OUTER_DEGREES - LEVEL_INNER_DEGREES), 0),
    1,
  );
  return blockHeight + (height - blockHeight) * smooth(t);
}

/** Heights for one terrain tile, north row first, as Cesium's heightmaps are laid out. */
function tileHeights(tilingScheme, x, y, level) {
  const { west, south, east, north } = tilingScheme.tileXYToRectangle(x, y, level);
  const heights = new Float32Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const step = 1 / (TERRAIN_SAMPLES - 1);
  for (let row = 0; row < TERRAIN_SAMPLES; row++) {
    const lat = Cesium.Math.toDegrees(north - (north - south) * row * step);
    for (let column = 0; column < TERRAIN_SAMPLES; column++) {
      const lon = Cesium.Math.toDegrees(west + (east - west) * column * step);
      heights[row * TERRAIN_SAMPLES + column] = ground(lon, lat);
    }
  }
  return heights;
}

const drones = () =>
  [
    {
      id: 'uav-1',
      colour: Cesium.Color.fromCssColorString('#00838f'),
      track: [
        [-116.42, 43.4],
        [-116.36, 43.47],
        [-116.28, 43.52],
        [-116.2, 43.55],
      ],
    },
    {
      id: 'uav-2',
      colour: Cesium.Color.fromCssColorString(variant === 'faint' ? '#f57c1a' : '#ef6c00'),
      track: [
        [-116.02, 43.38],
        [-116.06, 43.46],
        [-116.12, 43.52],
        [-116.16, 43.58],
      ],
    },
    {
      id: 'uav-3',
      colour: Cesium.Color.fromCssColorString('#6a1b9a'),
      track: [
        [-116.3, 43.3],
        [-116.24, 43.35],
        [-116.2, 43.42],
        [-116.18, 43.48],
      ],
    },
  ].filter((drone) => !(variant === 'regression' && drone.id === 'uav-2'));

const geofences = () => [
  {
    id: 'restricted',
    colour: Cesium.Color.fromCssColorString('#d50000'),
    alpha: variant === 'faint' ? 0.3 : 0.2,
    offset: variant === 'regression' ? 0.06 : 0,
    corners: [
      [-116.34, 43.42],
      [-116.24, 43.4],
      [-116.22, 43.47],
      [-116.3, 43.5],
    ],
  },
  {
    id: 'operating-area',
    colour: Cesium.Color.fromCssColorString('#2962ff'),
    alpha: 0.12,
    offset: 0,
    corners: [
      [-116.12, 43.33],
      [-115.98, 43.36],
      [-116.0, 43.48],
      [-116.1, 43.5],
    ],
  },
];

const degrees = (points, height = () => 0) =>
  points.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, height(lon, lat)));

function addGeofence(viewer, fence) {
  const corners = fence.corners.map(([lon, lat]) => [lon + fence.offset, lat]);
  const outline = degrees([...corners, corners[0]]);
  viewer.entities.add({
    id: fence.id,
    polygon: {
      hierarchy: degrees(corners),
      material: fence.colour.withAlpha(fence.alpha),
    },
    polyline: {
      positions: outline,
      clampToGround: true,
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({ color: fence.colour, dashLength: 12 }),
    },
  });
}

function addDrone(viewer, drone) {
  const above = (lon, lat) => ground(lon, lat) + STEM_HEIGHT;
  const path = degrees(drone.track, above);
  const [lon, lat] = drone.track.at(-1);
  viewer.entities.add({
    id: `${drone.id}-track`,
    polyline: { positions: path, width: 2.5, material: drone.colour },
  });
  viewer.entities.add({
    id: `${drone.id}-stem`,
    polyline: {
      positions: [
        Cesium.Cartesian3.fromDegrees(lon, lat, ground(lon, lat)),
        Cesium.Cartesian3.fromDegrees(lon, lat, above(lon, lat)),
      ],
      width: 1.5,
      material: Cesium.Color.fromCssColorString('#263238'),
    },
  });
  viewer.entities.add({
    id: drone.id,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, above(lon, lat)),
    point: {
      pixelSize: 10,
      color: drone.colour,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: drone.id.toUpperCase(),
      font: '600 13px sans-serif',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString('#263238'),
      outlineWidth: 3,
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** A flat textured square: a glTF built here, with its texture in a file of its own. */
async function addMarker(viewer) {
  const half = MARKER.size / 2;
  // glTF's y-up axes: x east, y up, z south.
  const positions = new Float32Array([
    -half,
    0,
    half,
    half,
    0,
    half,
    half,
    0,
    -half,
    -half,
    0,
    -half,
  ]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const bin = new Uint8Array(positions.byteLength + uvs.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(uvs.buffer), positions.byteLength);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength + uvs.byteLength);
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] },
    ],
    materials: [
      {
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
        doubleSided: true,
      },
    ],
    textures: [{ source: 0 }],
    images: [{ uri: 'marker.png' }],
    buffers: [
      {
        byteLength: bin.byteLength,
        uri: `data:application/octet-stream;base64,${window.btoa(String.fromCharCode(...bin))}`,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: uvs.byteLength },
      {
        buffer: 0,
        byteOffset: positions.byteLength + uvs.byteLength,
        byteLength: indices.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [-half, 0, -half],
        max: [half, 0, half],
      },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  };
  const model = await Cesium.Model.fromGltfAsync({
    gltf,
    basePath: new URL('./', window.location.href).href,
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(
        MARKER.lon,
        MARKER.lat,
        ground(MARKER.lon, MARKER.lat) + MARKER.above,
      ),
    ),
  });
  model.texturesReadyEvent.addEventListener(() => {
    document.body.dataset.markerTextures = 'loaded';
  });
  viewer.scene.primitives.add(model);
}

function addBillboards(viewer) {
  const [lon, lat] = [-116.32, 43.38];
  const position = Cesium.Cartesian3.fromDegrees(lon, lat, ground(lon, lat) + STEM_HEIGHT);
  const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  billboards.add({ position, image: 'marker.png', scale: 3 });
  billboards.add({ position });
  billboards.add({ position, image: 'missing.png' });
  window.billboards = billboards;
}

async function addBlock(viewer) {
  const tileset = await Cesium.Cesium3DTileset.fromUrl('tiles/tileset.json');
  tileset.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(BLOCK.lon, BLOCK.lat, blockHeight),
  );
  viewer.scene.primitives.add(tileset);
  window.tileset = tileset;
  return tileset;
}

/** Marks the body ready once everything has stayed loaded for several frames. */
function markWhenReady(viewer, tileset) {
  let stable = 0;
  viewer.scene.postRender.addEventListener(() => {
    const loaded =
      viewer.scene.globe.tilesLoaded &&
      viewer.dataSourceDisplay.ready &&
      (tileset?.tilesLoaded ?? true);
    stable = loaded ? stable + 1 : 0;
    if (stable >= STABLE_FRAMES) document.body.dataset.ready = 'true';
  });
}

async function start() {
  const tilingScheme = new Cesium.GeographicTilingScheme();
  const terrainProvider = new Cesium.CustomHeightmapTerrainProvider({
    width: TERRAIN_SAMPLES,
    height: TERRAIN_SAMPLES,
    tilingScheme,
    callback: (x, y, level) => tileHeights(tilingScheme, x, y, level),
  });
  const terrainAfter = Number(params.get('terrainAfter') ?? 0);
  const terrain =
    terrainAfter > 0
      ? {
          terrain: new Cesium.Terrain(
            new Promise((resolve) => setTimeout(() => resolve(terrainProvider), terrainAfter)),
          ),
        }
      : { terrainProvider };
  const viewer = new Cesium.Viewer('scene', {
    ...terrain,
    baseLayer: Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      ),
    ),
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    contextOptions: { requestWebgl1: params.has('webgl1') },
    requestRenderMode: params.has('requestRender'),
  });

  const seconds = variant === 'subtle' ? SUBTLE_SECONDS : 0;
  viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
    Cesium.JulianDate.fromIso8601(TIME),
    seconds,
    new Cesium.JulianDate(),
  );
  viewer.clock.shouldAnimate = false;
  viewer.scene.globe.enableLighting = true;
  // Distance haze washes the relief out at this altitude.
  viewer.scene.globe.showGroundAtmosphere = false;

  geofences().forEach((fence) => addGeofence(viewer, fence));
  drones().forEach((drone) => addDrone(viewer, drone));

  const camera = params.has('tiles')
    ? { ...BLOCK_CAMERA, height: blockHeight + BLOCK_CAMERA.aboveBlock }
    : CAMERA;
  const heading = camera.heading + (variant === 'shifted' ? SHIFT_DEGREES : 0);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, camera.height),
    orientation: {
      heading: Cesium.Math.toRadians(heading),
      pitch: Cesium.Math.toRadians(camera.pitch),
      roll: 0,
    },
  });

  if (params.has('billboards')) addBillboards(viewer);

  viewer.scene.renderError.addEventListener((_, error) => {
    document.body.dataset.error = describeError(error);
  });
  window.viewer = viewer;
  document.body.dataset.webgl = 'available';
  if (params.has('model')) await addMarker(viewer);
  const tileset = params.has('tiles') ? await addBlock(viewer) : undefined;
  markWhenReady(viewer, tileset);
}

/** The error and where it was thrown; the message's first line is what tables and reports show. */
const describeError = (error) =>
  error instanceof Error && error.stack ? `${error}\n${error.stack}` : String(error);

/** Whether Cesium failed for want of something the browser lacks: WebGL, or a browser API. */
const environmentGap = (error) => error instanceof ReferenceError || /WebGL/.test(String(error));

if (typeof Cesium === 'undefined') {
  document.body.dataset.error = 'CesiumJS did not load';
} else {
  start().catch((error) => {
    if (environmentGap(error)) document.body.dataset.unsupported = String(error);
    else document.body.dataset.error = describeError(error);
  });
}
