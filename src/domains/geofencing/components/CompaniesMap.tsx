import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';

import { Icon, Text } from '@src/components/atoms';
import type { LatLng } from '@src/core/geo';
import { colors, fontSize, radius, spacing } from '@src/theme';

import { DARK_MAP_STYLE } from '@src/domains/geofencing/components/mapStyle';
import { regionFor } from '@src/domains/geofencing/components/mapRegion';
import type { Company, Room, TargetState } from '@src/domains/geofencing/types';

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
  onRecenter?: () => Promise<LatLng | null>;
  recenterLabel?: string;
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
  onRecenter,
  recenterLabel,
}: CompaniesMapProps): React.JSX.Element {
  const mapRef = useRef<MapView>(null);
  const [recentering, setRecentering] = useState(false);
  const region = useMemo(() => (center ? regionFor(center, spanMeters) : null), [center, spanMeters]);

  const ready = useRef(false);
  const framed = useRef<string | null>(null);

  const frameKey = region
    ? `${region.latitude.toFixed(5)}:${region.longitude.toFixed(5)}:${region.latitudeDelta.toFixed(5)}`
    : null;

  const applyRegion = useCallback(
    (animated: boolean) => {
      if (!region || frameKey === null || framed.current === frameKey) return;
      framed.current = frameKey;
      mapRef.current?.animateToRegion(region, animated ? 400 : 0);
    },
    [region, frameKey],
  );

  const applyInitialRegion = useCallback(() => {
    ready.current = true;
    applyRegion(false);
  }, [applyRegion]);

  useEffect(() => {
    if (ready.current) applyRegion(true);
  }, [applyRegion]);

  const handleRecenter = useCallback(async () => {
    if (!onRecenter || recentering) return;
    setRecentering(true);
    try {
      const target = await onRecenter();
      if (target) {
        framed.current = null;
        mapRef.current?.animateToRegion(regionFor(target, spanMeters), 400);
      }
    } finally {
      setRecentering(false);
    }
  }, [onRecenter, recentering, spanMeters]);

  if (!region) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        userInterfaceStyle="dark"
        customMapStyle={DARK_MAP_STYLE}
        onMapReady={applyInitialRegion}
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
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.title}
            pinColor={colors.primary}
          />
        ))}
      </MapView>

      {onRecenter ? (
        <TouchableOpacity
          style={styles.recenter}
          onPress={() => void handleRecenter()}
          accessibilityRole="button"
          accessibilityLabel={recenterLabel}
          hitSlop={8}
        >
          <Icon
            name="location.fill"
            size={20}
            color={recentering ? colors.textMuted : colors.text}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  recenter: {
    position: 'absolute',
    right: spacing.md,
    bottom: 34,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayStrong,
  },
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
