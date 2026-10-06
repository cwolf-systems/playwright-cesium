# Accuracy

Does each way of waiting for a CesiumJS scene say "done" when the scene is done? Reproduce with
`npm run bench:accuracy` (`bench/accuracy.mjs`).

## Method

Each method opens the [demo scene](../../demo/scene.js) in a fresh browser, waits its own way and
takes a screenshot. The capture is **premature** if it differs visibly from a reference of the
finished scene, judged by [playwright-perceptual](https://github.com/cwolf-systems/playwright-perceptual)
at its defaults. The reference does not rely on `settled()`: it is taken after 60 consecutive frames
with nothing loading, and must then match a second screenshot taken two seconds later.

Methods:

- **`settled()`**: this package.
- **`settled()`, virtual clock**: the same, with the virtual frame clock installed before navigating.
- **`networkidle`**: Playwright's wait for no network activity for 500 ms, as CesiumJS's own
  end-to-end suite uses.
- **sleep 1, 3 and 5 s** after the page's `load` event.
- **load event**: Playwright's default, waiting for nothing else.
- **3 identical screenshots**: screenshots a second apart until three in a row are identical, the
  method Re:Earth published for PLATEAU VIEW.

Scenarios:

- **demo**: the mission scene as it is.
- **imagery 1–3 s late**: every imagery tile held back by 1 to 3 s through `page.route`, fixed per
  tile so every run sees the same delays.
- **3D Tiles**: the demo's block of buildings (`?tiles`), with the camera close enough that the
  tileset's root refines into its four children.
- **3D tiles 1–3 s late**: the same, with the four child tiles held back.
- **request-render mode**: the mission scene with Cesium's `requestRenderMode`, which renders only
  when something changes.
- **CPU 4× slower**: Chromium's DevTools CPU throttling, standing in for a slow CI machine
  (Chromium only).

Three runs of each. Times are from launching the browser to the screenshot, so they include the
same few seconds of start-up for every method; they compare methods within a column, not across
machines.

## Results

macOS 15.3, Apple M4; CesiumJS 1.146, Playwright 1.60, nothing else running. Each cell: premature
captures out of three, and the median time.

### All runs

| Method                   | Premature captures |
| ------------------------ | ------------------ |
| settled()                | 0 of 33            |
| settled(), virtual clock | 0 of 33            |
| networkidle              | 10 of 33           |
| sleep 1 s                | 24 of 33           |
| sleep 3 s                | 15 of 33           |
| sleep 5 s                | 6 of 33            |
| load event               | 33 of 33           |
| 3 identical screenshots  | 3 of 33            |

### Chromium

| Method                   | demo       | imagery 1–3 s late | 3D Tiles   | 3D tiles 1–3 s late | request-render mode | CPU 4× slower |
| ------------------------ | ---------- | ------------------ | ---------- | ------------------- | ------------------- | ------------- |
| settled()                | 0/3, 3.9 s | 0/3, 8.8 s         | 0/3, 6.1 s | 0/3, 5.9 s          | 0/3, 5.3 s          | 0/3, 5.0 s    |
| settled(), virtual clock | 0/3, 3.6 s | 0/3, 8.3 s         | 0/3, 5.9 s | 0/3, 5.8 s          | 0/3, 3.6 s          | 0/3, 4.5 s    |
| networkidle              | 2/3, 2.5 s | 0/3, 8.4 s         | 3/3, 3.4 s | 0/3, 4.8 s          | 1/3, 3.1 s          | 3/3, 1.8 s    |
| sleep 1 s                | 3/3, 2.5 s | 3/3, 2.0 s         | 3/3, 2.9 s | 3/3, 3.2 s          | 3/3, 2.5 s          | 3/3, 3.2 s    |
| sleep 3 s                | 0/3, 4.1 s | 3/3, 3.9 s         | 3/3, 4.0 s | 3/3, 4.0 s          | 0/3, 3.8 s          | 0/3, 4.6 s    |
| sleep 5 s                | 0/3, 6.0 s | 3/3, 6.1 s         | 0/3, 6.2 s | 0/3, 6.2 s          | 0/3, 5.7 s          | 0/3, 6.6 s    |
| load event               | 3/3, 1.4 s | 3/3, 1.4 s         | 3/3, 1.8 s | 3/3, 1.9 s          | 3/3, 1.3 s          | 3/3, 1.9 s    |
| 3 identical screenshots  | 0/3, 6.6 s | 0/3, 11.3 s        | 0/3, 7.5 s | 0/3, 7.5 s          | 0/3, 5.2 s          | 0/3, 7.2 s    |

### WebKit

| Method                   | demo       | imagery 1–3 s late | 3D Tiles   | 3D tiles 1–3 s late | request-render mode |
| ------------------------ | ---------- | ------------------ | ---------- | ------------------- | ------------------- |
| settled()                | 0/3, 1.2 s | 0/3, 6.9 s         | 0/3, 1.4 s | 0/3, 3.7 s          | 0/3, 3.1 s          |
| settled(), virtual clock | 0/3, 1.3 s | 0/3, 7.0 s         | 0/3, 1.6 s | 0/3, 3.7 s          | 0/3, 1.3 s          |
| networkidle              | 0/3, 1.2 s | 0/3, 7.2 s         | 0/3, 1.2 s | 0/3, 4.0 s          | 1/3, 1.3 s          |
| sleep 1 s                | 0/3, 1.5 s | 3/3, 1.5 s         | 0/3, 1.5 s | 3/3, 1.5 s          | 0/3, 1.5 s          |
| sleep 3 s                | 0/3, 3.4 s | 3/3, 3.5 s         | 0/3, 3.5 s | 3/3, 3.5 s          | 0/3, 3.5 s          |
| sleep 5 s                | 0/3, 5.5 s | 3/3, 5.5 s         | 0/3, 5.5 s | 0/3, 5.4 s          | 0/3, 5.5 s          |
| load event               | 3/3, 0.6 s | 3/3, 0.5 s         | 3/3, 0.6 s | 3/3, 0.5 s          | 3/3, 0.6 s          |
| 3 identical screenshots  | 0/3, 3.6 s | 3/3, 3.7 s         | 0/3, 3.6 s | 0/3, 5.6 s          | 0/3, 3.6 s          |

## Reading the results

- **`settled()` never captured an unfinished scene,** with or without the virtual clock, in any
  browser or scenario. Of the methods that were right, it was among the quicker ones in most
  columns. In request-render mode it is slower (5.3 s in Chromium against 3.8 s for a 3 s sleep
  that happened to be enough): Cesium renders only when asked there, so `settled()` renders a
  frame itself every 250 ms, and ten quiet frames take at least 2.5 s. Under the virtual clock it
  renders a frame at every look, which brings that down to 3.6 s.
- **`networkidle` is unreliable for Cesium in Chromium.** It returned before the scene was finished
  in 9 of the 18 Chromium runs, and in all three on the 3D Tiles block: the network goes quiet
  while Cesium is still processing tiles and building entities. In WebKit it was premature once.
  Across runs of this benchmark its result for late imagery in Chromium has been both 2 of 3
  premature and none, which is the problem: whether it is right depends on timing.
- **No fixed sleep is safe.** Even 5 s captured an unfinished scene whenever imagery was late, in
  both browsers, while costing seconds on every scene that was ready sooner.
- **Waiting for identical screenshots can be fooled.** With imagery held back in WebKit, three
  screenshots a second apart were identical while tiles were still on their way, and the capture
  was premature every time. It is also slow by design.
- **The load event is never enough.** It fires before Cesium has drawn the globe.

## Limits

- One machine and three runs per cell. CI platforms are not measured here; the platform probe
  shows software rendering there takes several times longer, which favours waiting on the scene
  itself over any fixed time.
- Two scenes, both from the demo: the mission scene and a small 3D Tiles block. Models, billboard
  images and camera flights are covered by the test suite, not by this benchmark.
