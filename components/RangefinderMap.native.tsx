import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';

import type { LatLon } from '@/lib/geo';
import type { RangefinderMapProps } from '@/components/RangefinderMap.types';
import { useTheme } from '@/state/ThemeContext';

const REGION_DELTA = 0.0035;

function toRegion(center: LatLon): Region {
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: REGION_DELTA,
    longitudeDelta: REGION_DELTA,
  };
}

export function RangefinderMap({
  userLocation,
  targetLocation,
  initialCenter,
  accuracyMeters,
  onTargetChange,
}: RangefinderMapProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mapRef = useRef<MapView | null>(null);

  const center = userLocation ?? targetLocation ?? initialCenter;
  const initialRegion = useMemo(() => (center ? toRegion(center) : null), [center]);

  useEffect(() => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateToRegion(toRegion(userLocation), 450);
  }, [userLocation?.latitude, userLocation?.longitude]);

  if (!initialRegion) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingTitle}>Finding your location…</Text>
        <Text style={styles.loadingBody}>
          Move outdoors and keep Tee Time open so GPS can lock on.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        mapType="satellite"
        pitchEnabled={false}
        rotateEnabled={false}
        showsCompass={false}
        showsScale
        showsUserLocation
        showsMyLocationButton={false}
        onPress={(event) => onTargetChange(event.nativeEvent.coordinate)}>
        {userLocation && accuracyMeters && accuracyMeters > 0 ? (
          <Circle
            center={userLocation}
            radius={accuracyMeters}
            strokeColor="rgba(37, 99, 235, 0.55)"
            fillColor="rgba(37, 99, 235, 0.14)"
          />
        ) : null}
        {targetLocation ? (
          <Marker
            coordinate={targetLocation}
            draggable
            pinColor={colors.accent}
            onDragEnd={(event) => onTargetChange(event.nativeEvent.coordinate)}
          />
        ) : null}
      </MapView>

      <Pressable
        style={[styles.recenter, !userLocation && styles.recenterDisabled]}
        disabled={!userLocation}
        onPress={() => {
          if (userLocation) {
            mapRef.current?.animateToRegion(toRegion(userLocation), 450);
          }
        }}
        hitSlop={8}>
        <Text style={styles.recenterText}>⌖</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: colors.chipBg,
    },
    map: {
      flex: 1,
    },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: colors.chipBg,
    },
    loadingTitle: {
      fontSize: 16,
      fontWeight: '900',
      color: colors.textTitle,
      textAlign: 'center',
    },
    loadingBody: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
      textAlign: 'center',
    },
    recenter: {
      position: 'absolute',
      right: 14,
      top: 14,
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.92)',
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    recenterDisabled: {
      opacity: 0.45,
    },
    recenterText: {
      fontSize: 22,
      lineHeight: 24,
      fontWeight: '900',
      color: colors.primaryDark,
    },
  });
}
