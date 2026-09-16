import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { Text } from '@src/components/atoms';
import type { LatLng } from '@src/core/geo';
import { colors, fontSize, radius, spacing } from '@src/theme';
import { Platform } from 'react-native';

import type { Place, Room, TargetState } from '../types';

export interface PlacesMapProps {
  center: LatLng | null;
  places: readonly Place[];
  rooms: readonly Room[];
  states: ReadonlyMap<string, TargetState>;
  /** Metres across the viewport. Small values zoom into room scale. */
  spanMeters?: number;
  onPressMap?: (point: LatLng) => void;
  extraPolygon?: { coordinates: LatLng[]; color: string } | null;
  markers?: readonly { id: string; coordinate: LatLng; title?: string }[];
  emptyLabel: string;
}

const METERS_PER_DEGREE_LATITUDE = 111320;

function regionFor(center: LatLng, spanMeters: number): Region {
  const latitudeDelta = spanMeters / METERS_PER_DEGREE_LATITUDE;
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta,
    // Longitude degrees are shorter away from the equator, so the same distance
    // needs a wider delta — otherwise the viewport is squashed horizontally.
    longitudeDelta: latitudeDelta / Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.1),
  };
}

/**
 * Shared map surface.
 *
 * Android renders through the Google provider (the only one available there);
 * iOS uses MapKit, which needs no API key. Callers are responsible for checking
 * `isMapAvailable` before mounting this.
 */
export function PlacesMap({
  center,
  places,
  rooms,
  states,
  spanMeters = 1200,
  onPressMap,
  extraPolygon = null,
  markers = [],
  emptyLabel,
}: PlacesMapProps): React.JSX.Element {
  const region = useMemo(() => (center ? regionFor(center, spanMeters) : null), [center, spanMeters]);

  if (!region) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <MapView
      style={styles.map}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      initialRegion={region}
      region={region}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onPress={onPressMap ? (event) => onPressMap(event.nativeEvent.coordinate) : undefined}
    >
      {places.map((place) => {
        const inside = states.get(place.id)?.state === 'inside';
        const accent = inside ? colors.success : colors.primary;
        return (
          <React.Fragment key={place.id}>
            {/* Entry threshold. */}
            <Circle
              center={place}
              radius={place.radius}
              strokeColor={accent}
              strokeWidth={2}
              fillColor={`${accent}26`}
            />
            {/* Exit threshold — the dead band is the gap between the two. */}
            <Circle
              center={place}
              radius={place.activeRadius}
              strokeColor={`${accent}80`}
              strokeWidth={1}
              fillColor="transparent"
            />
            {place.polygon && place.polygon.length >= 3 ? (
              <Polygon
                coordinates={place.polygon}
                strokeColor={colors.textSecondary}
                strokeWidth={1}
                fillColor="transparent"
              />
            ) : null}
          </React.Fragment>
        );
      })}

      {rooms.map((room) => {
        const inside = states.get(room.id)?.state === 'inside';
        return (
          <Polygon
            key={room.id}
            coordinates={room.polygon}
            strokeColor={inside ? colors.success : colors.warning}
            strokeWidth={2}
            fillColor={inside ? `${colors.success}4D` : `${colors.warning}1A`}
          />
        );
      })}

      {extraPolygon && extraPolygon.coordinates.length >= 2 ? (
        <Polygon
          coordinates={extraPolygon.coordinates}
          strokeColor={extraPolygon.color}
          strokeWidth={2}
          fillColor={`${extraPolygon.color}33`}
        />
      ) : null}

      {markers.map((marker) => (
        <Marker key={marker.id} coordinate={marker.coordinate} title={marker.title} pinColor={colors.primary} />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  placeholderText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
});
