import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { Text } from '@src/components/atoms';
import type { LatLng, Ring } from '@src/core/geo';
import { colors, fontSize, radius as radii, spacing } from '@src/theme';

const METERS_PER_DEGREE_LATITUDE = 111320;

function regionFor(center: LatLng, spanMeters: number): Region {
  const latitudeDelta = spanMeters / METERS_PER_DEGREE_LATITUDE;
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta / Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.1),
  };
}

export interface CrosshairMapProps {
  initialCenter: LatLng;
  spanMeters?: number;
  draft: Ring;
  parentPolygon?: Ring | null;
  siblings?: readonly { id: string; name: string; polygon: Ring }[];
  onCenterMove: (center: LatLng) => void;
  readoutLabel: string;
  invalid?: boolean;
}

export function CrosshairMap({
  initialCenter,
  spanMeters = 80,
  draft,
  parentPolygon = null,
  siblings = [],
  onCenterMove,
  readoutLabel,
  invalid = false,
}: CrosshairMapProps): React.JSX.Element {
  const [readout, setReadout] = useState<LatLng>(initialCenter);
  const initialRegion = useRef(regionFor(initialCenter, spanMeters)).current;

  const handleRegionChange = useCallback(
    (region: Region) => {
      onCenterMove({ latitude: region.latitude, longitude: region.longitude });
    },
    [onCenterMove],
  );

  const handleRegionChangeComplete = useCallback((region: Region) => {
    setReadout({ latitude: region.latitude, longitude: region.longitude });
  }, []);

  const closedDraft = draft.length >= 3 ? [...draft, draft[0]] : draft;
  const draftColor = invalid ? colors.error : colors.warning;

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        userInterfaceStyle="dark"
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {parentPolygon && parentPolygon.length >= 3 ? (
          <Polygon
            coordinates={parentPolygon}
            strokeColor={colors.primary}
            strokeWidth={2}
            fillColor={`${colors.primary}1A`}
          />
        ) : null}

        {siblings.map((sibling) => (
          <Polygon
            key={sibling.id}
            coordinates={sibling.polygon}
            strokeColor={colors.success}
            strokeWidth={2}
            fillColor={`${colors.success}33`}
          />
        ))}

        {draft.length >= 3 ? (
          <Polygon
            coordinates={draft}
            strokeColor={draftColor}
            strokeWidth={2}
            fillColor={`${draftColor}40`}
          />
        ) : null}

        {draft.length === 2 ? (
          <Polyline coordinates={closedDraft} strokeColor={draftColor} strokeWidth={2} />
        ) : null}

        {draft.map((vertex, index) => (
          <Marker
            key={`${vertex.latitude}:${vertex.longitude}:${index}`}
            coordinate={vertex}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.vertex, { backgroundColor: draftColor }]}>
              <Text style={styles.vertexLabel}>{index + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.crosshair} pointerEvents="none">
        <View style={styles.crosshairHalo} />
        <View style={styles.crosshairDot} />
        <View style={styles.crosshairStem} />
      </View>

      <View style={styles.readout} pointerEvents="none">
        <Text style={styles.readoutLabel}>{readoutLabel}</Text>
        <Text style={styles.readoutValue}>
          {readout.latitude.toFixed(6)}, {readout.longitude.toFixed(6)}
        </Text>
      </View>
    </View>
  );
}

const CROSSHAIR = 26;

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  crosshair: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairHalo: {
    position: 'absolute',
    width: CROSSHAIR,
    height: CROSSHAIR,
    borderRadius: CROSSHAIR / 2,
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: `${colors.warning}33`,
  },
  crosshairDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  crosshairStem: {
    position: 'absolute',
    top: '50%',
    width: 2,
    height: 18,
    marginTop: CROSSHAIR / 2 - 2,
    backgroundColor: colors.warning,
  },
  vertex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.warning,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertexLabel: { color: colors.background, fontSize: 10, fontWeight: '700' },
  readout: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.overlay,
    borderRadius: radii.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  readoutLabel: { color: colors.textMuted, fontSize: 10 },
  readoutValue: { color: colors.text, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
});
