import { METERS_PER_DEGREE_LATITUDE, metersPerDegreeLongitude, type Fix } from '@src/core/geo';

import type { Place } from '../types';

/**
 * Builds a synthetic walk through a place, for the simulator.
 *
 * Testing geofencing by walking around is slow and unrepeatable, and the
 * platform's own location simulators do not exercise the app's pipeline — they
 * only replace the fix source. Feeding a generated route through
 * `evaluateAndCommit` exercises the real state machine, the real deduplication
 * and the real notifications, deterministically, on a desk.
 */

export interface RouteOptions {
  /** Number of fixes along the path. */
  steps: number;
  /** Simulated milliseconds between consecutive fixes. */
  intervalMs: number;
  /** Reported accuracy, in meters. */
  accuracy: number;
  /** Direction of travel, degrees clockwise from north. */
  bearingDegrees: number;
  /** How far beyond `activeRadius` the walk starts and ends. */
  marginMeters: number;
  /**
   * Sideways shift, perpendicular to the bearing.
   *
   * A route straight through the centre of a grid of rooms runs exactly along
   * the wall they share, and a point on a boundary belongs to both polygons by
   * design — so the walk would report two rooms occupied at once. Nudging the
   * path a couple of metres off-centre keeps the simulation representative of a
   * real walk instead of a measure-zero artefact of synthetic geometry.
   */
  lateralOffsetMeters: number;
  /**
   * Timestamp of the final fix. The route is dated backwards from here so it
   * lands in the past: a route dated into the future would leave the state
   * machine's dwell anchors ahead of the real clock, and real monitoring would
   * then refuse to transition until it caught up.
   */
  endAt: number;
}

export const DEFAULT_ROUTE_OPTIONS: Omit<RouteOptions, 'endAt'> = {
  // Fine enough that the walk lands several fixes inside each room: a room is
  // only a few metres across, and a transition needs consecutive fixes to
  // agree before it commits.
  steps: 121,
  // Six seconds of simulated time per fix clears the dwell guard, so a route
  // produces the transitions a real walk would.
  intervalMs: 6_000,
  accuracy: 8,
  bearingDegrees: 0,
  marginMeters: 60,
  lateralOffsetMeters: 3,
};

/**
 * A straight line that starts outside the place, passes exactly through its
 * centre and leaves the other side — so it necessarily crosses `activeRadius`,
 * then `radius`, then whichever room polygons lie on the way.
 */
export function buildCrossingRoute(place: Place, options: RouteOptions): Fix[] {
  const {
    steps,
    intervalMs,
    accuracy,
    bearingDegrees,
    marginMeters,
    lateralOffsetMeters,
    endAt,
  } = options;
  if (steps < 2) return [];

  const half = place.activeRadius + marginMeters;
  const radians = (bearingDegrees * Math.PI) / 180;
  const metersPerLongitude = metersPerDegreeLongitude(place.latitude);

  // Unit vector along the bearing, and the one perpendicular to it.
  const forwardNorth = Math.cos(radians);
  const forwardEast = Math.sin(radians);
  const sideNorth = -forwardEast;
  const sideEast = forwardNorth;

  const startAt = endAt - (steps - 1) * intervalMs;

  return Array.from({ length: steps }, (_, index) => {
    // -half at the first step, +half at the last.
    const along = -half + (2 * half * index) / (steps - 1);

    const north = along * forwardNorth + lateralOffsetMeters * sideNorth;
    const east = along * forwardEast + lateralOffsetMeters * sideEast;

    return {
      latitude: place.latitude + north / METERS_PER_DEGREE_LATITUDE,
      longitude: place.longitude + east / metersPerLongitude,
      accuracy,
      timestamp: startAt + index * intervalMs,
    };
  });
}

/** A route that enters, waits inside, and never leaves. Exercises entry alone. */
export function buildApproachRoute(place: Place, options: RouteOptions): Fix[] {
  const full = buildCrossingRoute(place, options);
  const middle = Math.ceil(full.length / 2);
  const head = full.slice(0, middle);

  // Hold at the centre for the rest of the steps so the dwell window elapses
  // without the route walking back out.
  const centre = head[head.length - 1];
  const tail = Array.from({ length: full.length - middle }, (_, index) => ({
    ...centre,
    timestamp: centre.timestamp + (index + 1) * options.intervalMs,
  }));

  return [...head, ...tail];
}
