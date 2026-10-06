/** Base class for errors this package throws. A failed assertion is a test result, not an error. */
export class CesiumTestError extends Error {
  override name = 'CesiumTestError';
}

/** An option outside its allowed range. */
export class InvalidOptionError extends CesiumTestError {
  override name = 'InvalidOptionError';

  constructor(
    readonly option: string,
    readonly value: unknown,
    expected: string,
  ) {
    super(`${option} must be ${expected}, got ${String(value)}`);
  }
}

/** The attach expression did not evaluate to a Cesium Viewer or CesiumWidget. */
export class NotAViewerError extends CesiumTestError {
  override name = 'NotAViewerError';

  constructor(
    readonly expression: string,
    found: string,
  ) {
    super(`${expression} is not a Cesium Viewer or CesiumWidget: it evaluated to ${found}`);
  }
}

/** The scene was still loading when the time ran out. */
export class NotSettledError extends CesiumTestError {
  override name = 'NotSettledError';

  constructor(
    readonly timeoutMs: number,
    readonly pending: readonly string[],
  ) {
    super(`The scene did not settle within ${timeoutMs} ms. Still pending: ${pending.join('; ')}.`);
  }
}

/** Cesium's render loop threw, and Cesium has stopped rendering. */
export class RenderError extends CesiumTestError {
  override name = 'RenderError';

  constructor(readonly cesiumMessage: string) {
    super(`Cesium stopped rendering: ${cesiumMessage}`);
  }
}

/** A step was asked for without the virtual frame clock that makes steps exact. */
export class VirtualClockRequiredError extends CesiumTestError {
  override name = 'VirtualClockRequiredError';

  constructor(operation: string) {
    super(
      `${operation} needs the virtual frame clock: call cesium.useVirtualClock() before page.goto()`,
    );
  }
}
