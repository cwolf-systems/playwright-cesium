# Using playwright-cesium

## Attach to the scene

Use the package's `test`, which adds a `cesium` fixture, and attach to the application's Viewer or
CesiumWidget by an expression evaluated in the page:

```ts
import { expect, test } from '@cwolf-systems/playwright-cesium';

test('mission view', async ({ page, cesium }) => {
  await page.goto('/viewer');
  const scene = await cesium.attach('window.viewer');
  await scene.settled();
  await expect(page).toHaveScreenshot();
});
```

Cesium keeps no registry of viewers, so the application has to make one reachable, such as
`window.viewer`, or a debug handle behind a query parameter. An expression that evaluates to
anything else throws `NotAViewerError`, naming what it found.

Without the fixture, `attach(page, 'window.viewer')` does the same.

`scene.info` says whether it is a `Viewer` or a `CesiumWidget`, and the CesiumJS version.

## Wait until it has settled

`scene.settled()` watches the frames Cesium renders until, for ten in a row:

- the terrain exists (a `Terrain` set on the scene has created its provider), and the globe's
  tiles have loaded with none queued;
- every 3D Tiles tileset has loaded its tiles;
- no requests are in flight;
- entities are built (a Viewer's data sources are ready);
- no primitive is still getting ready, no glTF model is still loading its textures, and no
  billboard is waiting for its image;
- no camera flight or other tween is running;
- the page's fonts have loaded.

It adds no frames of its own while Cesium is rendering. When Cesium renders none for a quarter of
a second, as in `requestRenderMode`, under a paused clock, or when its render loop has stopped,
`settled()` renders one itself.

Cesium draws a label's glyphs once, in whatever font is available then, and keeps them. A label
created before its web font loaded stays in the fallback font however long the test waits, so load
the font first (`await document.fonts.load('16px "Mission Sans"')`) when labels must match.

A billboard with no image, or one whose image failed to load, does not hold the scene back. Cesium
logs the failure to the console.

A tileset counts from when it is in the scene. While the page is still creating one, with its
`tileset.json` in flight, it shows only as a request in flight, which `settled()` sees through the
Cesium namespace (see [Bundled applications](#bundled-applications)). Without the namespace, add
the tileset to the scene before settling.

| Option    | Default  | Meaning                                             |
| --------- | -------- | --------------------------------------------------- |
| `frames`  | `10`     | Consecutive frames with nothing loading             |
| `timeout` | `30_000` | Milliseconds to wait; `0` waits as long as it takes |

It returns how many frames it observed and how long it took. If the time runs out it throws
`NotSettledError`, whose message and `pending` list say what was still loading. If Cesium's render
loop throws, it throws `RenderError` at once with Cesium's message, instead of waiting out the
timeout.

## Hold time still

`scene.freeze(time)` stops Cesium's clock at an instant, a `Date` or an ISO 8601 string, so the
sun, lighting and time-dynamic entities hold still. It returns the instant the clock now reads.

```ts
await scene.freeze('2026-06-21T14:00:00Z');
```

Cesium fades the globe's sun lighting out as the camera comes close, so from a few kilometres up
day and night can look the same; the time still matters for the sky, models and anything
time-dynamic.

## Repeatable frames: the virtual clock

Install the virtual frame clock before navigating, and time in the page stands still: `Date`,
`performance.now()` and `requestAnimationFrame` move only when a frame is stepped, and
`Math.random()` is seeded. Cesium renders nothing on its own, before attaching or after, so frames
happen only when the test asks for them.

```ts
await cesium.useVirtualClock({ seed: 7 });
await page.goto('/viewer');
const scene = await cesium.attach('window.viewer');
await scene.settled(); // steps frames itself under the clock
await scene.step(30); // exactly 30 frames, each moving time on by one frame
```

| Option    | Default                | Meaning                                  |
| --------- | ---------------------- | ---------------------------------------- |
| `start`   | `2000-01-01T12:00:00Z` | Where virtual time starts (J2000)        |
| `seed`    | `1`                    | Seeds `Math.random`                      |
| `frameMs` | `1000 / 60`            | Virtual milliseconds each frame advances |

What it makes repeatable: Cesium's per-frame work budgets and its camera-still timers, which read
`performance.now()`, and the sequence `Math.random()` returns. What it cannot: network requests and
workers keep real time, so the frame a tile arrives in still varies; the finished scene does not.
Code that runs when a response arrives draws from the same random sequence, so which code gets
which values can change from one load to the next.

Ambient occlusion shows where that matters. Cesium fills its noise texture from `Math.random()` on
the first frame. Seeded, two loads drew identical pixels every time on an Apple M4, but on GitHub's
Windows runners they sometimes still differed: startup work there can draw values before that
frame.

There is no stepping backwards. A rendered frame changes state that cannot be undone (tiles loaded,
caches filled), and running time backwards would break Cesium's timers. Simulation time can go
back: `scene.freeze(earlier)` puts Cesium's clock at any instant. To see an earlier frame exactly,
reload with the same seed and step to it.

The clock changes what the whole page sees, so the application's own code reads virtual time too.
It replaces Playwright's `page.clock`; use one or the other. `settled()` also works under a paused
`page.clock`, more slowly: Cesium's render loop stops with it, so `settled()` renders a frame every
quarter second. The demo's 3D Tiles scene settles in about 14 s that way, against 4 s under the
virtual clock (Chromium, Apple M-series).

## Set the camera

`scene.setView(view)` puts the camera exactly at a place, with no flight: longitude and latitude in
degrees, height in metres above the ellipsoid, and heading, pitch and roll in degrees. Pitch
defaults to -90, looking straight down.

```ts
await scene.setView({ lon: -116.2, lat: 43.6, height: 2_500, heading: 15, pitch: -45 });
```

## Find a place on the canvas

`scene.project(position)` gives where a position lands on the canvas, in CSS pixels from its top
left, or `null` when it is behind the globe or off the canvas. It works through a camera transform
(as `lookAt` and a tracked entity set) and in 2D and Columbus view. Only the ellipsoid hides a
position: one behind a mountain or a building still gets its place on the canvas.

```ts
const point = await scene.project({ lon: -116.21, lat: 43.61, height: 120 });
```

## Read pixels

`scene.pixels(region?)` renders a frame and reads it, or a region of it in CSS pixels, at the
canvas's own resolution. It copies the canvas in the same task as the render, so it works without
`preserveDrawingBuffer`. The result is `{ data, width, height }` with 8-bit RGBA data, which
playwright-perceptual's `toBePerceptuallyNear` compares directly.

`scene.canvas` is the canvas as a Playwright locator, for screenshot assertions:

```ts
await expect(scene.canvas).toHaveScreenshot();
```

## Bundled applications

In-flight requests and the version are read from the page's `Cesium` namespace, `window.Cesium`
by default. An application that bundles CesiumJS and exposes no namespace still works; those two
readings are left out, and everything else is read from the scene itself. What only the request
count sees is work that has not reached the scene yet: a tileset whose `tileset.json` is still on
its way, or a model still downloading before it is added. Point to a namespace with
`cesium.attach('window.viewer', { cesium: 'window.MyCesium' })`, or expose one in test builds:

```ts
import * as Cesium from 'cesium';
Object.assign(window, { Cesium }); // in test builds only
```

## Errors

Misuse throws a subclass of `CesiumTestError`, each carrying its details:

| Error                       | When                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `NotAViewerError`           | The attach expression is not a Viewer or CesiumWidget (`.expression`) |
| `NotSettledError`           | The scene was still loading when the time ran out (`.pending`)        |
| `RenderError`               | Cesium's render loop threw (`.cesiumMessage`)                         |
| `VirtualClockRequiredError` | `scene.step()` without the virtual frame clock                        |
| `InvalidOptionError`        | An option is out of range (`.option`, `.value`)                       |
