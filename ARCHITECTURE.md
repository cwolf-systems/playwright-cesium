# Architecture

Playwright helpers for CesiumJS scenes. Plain TypeScript, no runtime dependencies, Playwright as a
peer. The package imports no Cesium: everything that touches a scene runs in the page, against
the build of CesiumJS the application ships.

## Layout

```
src/
  index.ts      the only entry point: the public API
  errors.ts     CesiumTestError and one subclass per kind of misuse
  defaults.ts   default options and their validation
  cesium.ts     the members of Cesium objects the package touches, described structurally
  scene.ts      the CesiumScene interface, and the class behind it, which only delegates
  fixture.ts    Playwright's test with the cesium fixture
  attach/       finding the Viewer or CesiumWidget, and watching it for render errors
  settle/       waiting until nothing is loading
  clock/        holding time still, and the virtual frame clock
  view/         the camera, and where positions land on the canvas
  capture/      reading pixels back
demo/           an offline CesiumJS scene, its generated 3D Tiles block and the server for it
bench/          measurements; results in docs/benchmarks/
```

Each capability is a folder holding three kinds of file: `types.ts` for its shapes, a file named
after it for the Node side, and `page.ts` for the functions that run in the browser. Imports
point one way, from `fixture.ts` and `scene.ts` into the capabilities and down to `cesium.ts`.

## Positions

**The browser half is explicit.** Playwright sends each function in a `page.ts` to the page on its
own, so those functions cannot use anything outside their own bodies at runtime. Lint enforces it:
a `page.ts` may only import types. What crosses the boundary is plain data or a handle. The build
compiles with the DOM's types for their sake; outside `page.ts` they appear only as types, never
in code that runs.

**No Cesium dependency.** `cesium.ts` describes only the members the package reads, such as
`scene.globe.tilesLoaded`, so any CesiumJS build an application ships works, from the full
`cesium` package to `@cesium/engine` bundled into an app. Classes it needs, such as `JulianDate`
and `Cartesian3`, are reached through the constructors of objects the scene already holds, so
nothing depends on a `Cesium` global either.

**Small public surface.** Users get the `CesiumScene` interface, never the class behind it or
the Playwright handles it holds. Options and results are plain interfaces.

**Errors for misuse, results for outcomes.** An attach expression that is not a viewer, a scene
that never settles and a render loop that stopped throw subclasses of `CesiumTestError`, each
carrying its details (`NotSettledError.pending`). Outcomes inside the package are tagged unions:
a frame is rendered or a render error; an inspection is a widget or not.

**Logic that can be pure is pure.** Deciding when a scene has settled, and describing what is
still loading, take plain data and are unit-tested without a browser. The settle loop takes
"render a frame" and "wait" as functions for the same reason.

## Testing

- `test/unit`: the settle rules and loop, option checks and errors. Coverage is enforced.
- `test/browser`: the API against the demo scene in Chromium and WebKit, each checked against an
  independent answer: tiles held back through `page.route`, a render loop broken on purpose, the
  camera read back, the point under a straight-down camera projected to the canvas centre, and
  pixels read back matched against a screenshot.
- `bench/platforms.mjs`: what each browser can do for CesiumJS on each platform.
