import { InvalidOptionError } from '../errors.js';
import type { Position, View } from './types.js';

const DEFAULT_PITCH = -90;

function within(option: string, value: number, min: number, max: number): number {
  if (!(value >= min && value <= max)) {
    throw new InvalidOptionError(option, value, `between ${min} and ${max}`);
  }
  return value;
}

function finite(option: string, value: number): number {
  if (!Number.isFinite(value)) throw new InvalidOptionError(option, value, 'a finite number');
  return value;
}

/** A position checked and with its height filled in. */
export function resolvePosition(position: Position): Required<Position> {
  return {
    lon: within('lon', position.lon, -180, 180),
    lat: within('lat', position.lat, -90, 90),
    height: finite('height', position.height ?? 0),
  };
}

/** A view checked and with its orientation filled in. */
export function resolveView(view: View): Required<View> {
  return {
    ...resolvePosition(view),
    heading: finite('heading', view.heading ?? 0),
    pitch: within('pitch', view.pitch ?? DEFAULT_PITCH, -90, 90),
    roll: finite('roll', view.roll ?? 0),
  };
}
