# Changelog

## 0.1.0

First release.

- `attach(page, expression)` and the `cesium` fixture: find a Viewer or CesiumWidget in the page,
  watch it for render errors, and tag its canvas for locators.
- `scene.settled()`: waits until, for consecutive frames, terrain, globe tiles and 3D Tiles have
  loaded, no requests are in flight, entities are built, primitives, model textures and billboard
  images are ready, no camera flight is running and fonts have loaded. Times out with what was
  still loading; fails at once on a render error.
- `scene.freeze(time)`: stops Cesium's clock at an instant.
- `useVirtualClock()` and `scene.step(n)`: `Date`, `performance.now()` and animation frames move
  only when a frame is stepped, and `Math.random()` is seeded, so the same steps draw the same
  pixels.
- `scene.setView(view)`, `scene.project(position)` and `scene.pixels(region)`: the camera, where a
  position lands on the canvas, and the canvas's pixels.
- An offline demo scene, with accuracy and platform benchmarks.
