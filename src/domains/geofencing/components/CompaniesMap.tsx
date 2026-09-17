import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { Text } from '@src/components/atoms';
import type { LatLng } from '@src/core/geo';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { Company, Room, TargetState } from '../types';

export interface CompaniesMapProps {
  center: LatLng | null;
  companies: readonly Company[];
  rooms: readonly Room[];
  states: ReadonlyMap<string, TargetState>;
  spanMeters?: number;
  onPressMap?: (point: LatLng) => void;
  extraPolygon?: { coordinates: LatLng[]; color: string } | null;
  markers?: readonly { id: string; coordinate: LatLng; title?: string }[];
  emptyLabel: string;
}

const METERS_PER_DEGREE_LATITUDE = 111320;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a93' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d0d0d' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e2e34' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b74' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#12161c' }] },
];

function regionFor(center: LatLng, spanMeters: number): Region {
  const latitudeDelta = spanMeters / METERS_PER_DEGREE_LATITUDE;
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta / Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.1),
  };
}

export function CompaniesMap({
  center,
  companies,
  rooms,
  states,
  spanMeters = 1200,
  onPressMap,
  extraPolygon = null,
  markers = [],
  emptyLabel,
}: CompaniesMapProps): React.JSX.Element {
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
      userInterfaceStyle="dark"
      customMapStyle={DARK_MAP_STYLE}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onPress={onPressMap ? (event) => onPressMap(event.nativeEvent.coordinate) : undefined}
    >
      {companies.map((company) => {
        const inside = states.get(company.id)?.state === 'inside';
        const accent = inside ? colors.success : colors.primary;
        return (
          <React.Fragment key={company.id}>
            <Circle
              center={company}
              radius={company.radius}
              strokeColor={accent}
              strokeWidth={2}
              fillColor={`${accent}26`}
            />
            <Circle
              center={company}
              radius={company.activeRadius}
              strokeColor={`${accent}80`}
              strokeWidth={1}
              fillColor="transparent"
            />
            {company.polygon && company.polygon.length >= 3 ? (
              <Polygon
                coordinates={company.polygon}
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
