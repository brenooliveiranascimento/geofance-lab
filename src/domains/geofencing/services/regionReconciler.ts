import { distanceMeters } from '@src/core/geo';
import type { LatLng } from '@src/core/geo';

import type { NativeRegion, Place } from '../types';

/**
 * Chooses which places get one of the scarce native-region slots.
 *
 * CoreLocation monitors 20 regions per app and the Android Geofencing API 100,
 * while the brief calls for 500+ places. The resolution is a moving window: keep
 * the nearest places registered, and spend one slot on a **guard region** — a
 * circle around the point the window was computed from. Leaving the guard is the
 * signal that the window may be stale, so the set is recomputed there and only
 * there. No polling, no timer, and the phone's own region monitoring does the
 * waking.
 *
 * Pure function: given the same places and origin it always produces the same
 * set, which is what lets the 500-place behaviour be tested without a device.
 */

export interface SelectRegionsOptions {
  /** Platform ceiling on simultaneously monitored regions. */
  limit: number;
  /** Floor applied to every registered radius (CLCircularRegion reliability). */
  minRegionRadiusMeters: number;
  /** Floor for the guard, so a dense cluster cannot produce a hair-trigger. */
  minGuardRadiusMeters: number;
  guardIdentifier: string;
}

export interface SelectedPlace {
  place: Place;
  /** Distance from the origin to the place's centre, in meters. */
  distanceMeters: number;
  /**
   * Distance to the place's `activeRadius` boundary. Negative when the origin is
   * already inside. This — not the centre distance — is what ranks the window:
   * a wide geofence a kilometre away can be more imminent than a narrow one
   * across the street.
   */
  edgeDistanceMeters: number;
}

export interface SelectRegionsResult {
  /** Everything to hand to `Location.startGeofencingAsync`, guard included. */
  regions: NativeRegion[];
  selected: SelectedPlace[];
  /** Null when every place fits — there is then nothing to go stale. */
  guard: NativeRegion | null;
  /** Places that did not get a slot. */
  omittedCount: number;
}

function toRegion(place: Place, minRadius: number): NativeRegion {
  return {
    identifier: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    // The registered circle is a doorbell, not the geofence. It is clamped up to
    // the platform's reliable minimum and set on `activeRadius` (the outer
    // threshold) so it always fires before the precise tier needs to decide.
    // The real radius/activeRadius crossings are resolved in JS from actual
    // fixes, which is also the only way room-sized polygons can work at all.
    radius: Math.max(place.activeRadius, minRadius),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

/**
 * Radius at which the window provably becomes stale.
 *
 * Moving by `d` changes every edge distance by at most `d`. So the last selected
 * place keeps its slot over the first omitted one as long as
 * `selected + d < omitted - d`, i.e. `d < (omitted - selected) / 2`. Half the gap
 * is therefore the largest guard that cannot be wrong, and the floor keeps a
 * tight cluster from re-registering on every step.
 */
function guardRadiusFor(
  lastSelectedEdge: number,
  firstOmittedEdge: number,
  minGuardRadiusMeters: number,
): number {
  const halfGap = (firstOmittedEdge - lastSelectedEdge) / 2;
  return Math.max(halfGap, minGuardRadiusMeters);
}

export function selectRegions(
  places: readonly Place[],
  origin: LatLng,
  options: SelectRegionsOptions,
): SelectRegionsResult {
  const { limit, minRegionRadiusMeters, minGuardRadiusMeters, guardIdentifier } = options;

  const ranked: SelectedPlace[] = places
    .filter((place) => place.enabled)
    .map((place) => {
      const distance = distanceMeters(origin, place);
      return {
        place,
        distanceMeters: distance,
        edgeDistanceMeters: distance - place.activeRadius,
      };
    })
    // Ties broken by id so the set is stable across runs — an unstable order
    // would churn the native registration for no reason.
    .sort(
      (a, b) =>
        a.edgeDistanceMeters - b.edgeDistanceMeters || a.place.id.localeCompare(b.place.id),
    );

  if (limit <= 0) {
    return { regions: [], selected: [], guard: null, omittedCount: ranked.length };
  }

  // Everything fits: use every slot for a real place and skip the guard, since
  // there is no omitted place for the window to go stale against.
  if (ranked.length <= limit) {
    return {
      regions: ranked.map((entry) => toRegion(entry.place, minRegionRadiusMeters)),
      selected: ranked,
      guard: null,
      omittedCount: 0,
    };
  }

  // One slot is spent on the guard.
  const selected = ranked.slice(0, limit - 1);
  const firstOmitted = ranked[limit - 1];
  const lastSelected = selected[selected.length - 1];

  const guard: NativeRegion = {
    identifier: guardIdentifier,
    latitude: origin.latitude,
    longitude: origin.longitude,
    radius: Math.max(
      guardRadiusFor(
        lastSelected.edgeDistanceMeters,
        firstOmitted.edgeDistanceMeters,
        minGuardRadiusMeters,
      ),
      minRegionRadiusMeters,
    ),
    // We sit at its centre by construction, so only the exit is meaningful.
    notifyOnEnter: false,
    notifyOnExit: true,
  };

  return {
    regions: [...selected.map((entry) => toRegion(entry.place, minRegionRadiusMeters)), guard],
    selected,
    guard,
    omittedCount: ranked.length - selected.length,
  };
}

/**
 * Whether the newly computed set differs from what is currently registered.
 *
 * Re-registering identical regions is not free — the platform tears down and
 * rebuilds monitoring, and on iOS that re-reports the initial state of every
 * region. Comparing first keeps that from happening on every guard crossing
 * that lands back on the same neighbours.
 */
export function regionsEqual(a: readonly NativeRegion[], b: readonly NativeRegion[]): boolean {
  if (a.length !== b.length) return false;

  const key = (region: NativeRegion) =>
    `${region.identifier}|${region.latitude.toFixed(6)}|${region.longitude.toFixed(6)}|${region.radius.toFixed(1)}|${region.notifyOnEnter}|${region.notifyOnExit}`;

  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}
