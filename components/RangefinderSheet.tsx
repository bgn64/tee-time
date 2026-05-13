import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { RangefinderMap } from '@/components/RangefinderMap';
import type { LatLon } from '@/lib/geo';
import { distanceYards, formatYards } from '@/lib/geo';
import { useLocation } from '@/state/LocationContext';
import { useTheme } from '@/state/ThemeContext';

const METERS_TO_YARDS = 1.0936133;
const POOR_ACCURACY_YARDS = 10;

type Props = {
  visible: boolean;
  courseName: string;
  holeNumber: number;
  par: number;
  yardage?: number;
  courseLocation: LatLon | null;
  onClose: () => void;
};

function formatAccuracy(accuracyMeters: number | null | undefined): string {
  if (!Number.isFinite(accuracyMeters ?? NaN) || accuracyMeters == null) return '';
  return `GPS ±${Math.round(accuracyMeters * METERS_TO_YARDS)} yd`;
}

export function RangefinderSheet({
  visible,
  courseName,
  holeNumber,
  par,
  yardage,
  courseLocation,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const {
    status,
    coords,
    rangefinderLocation,
    rangefinderError,
    startRangefinderWatch,
    stopRangefinderWatch,
    openSystemSettings,
  } = useLocation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [target, setTarget] = useState<LatLon | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTarget(null);
    if (Platform.OS === 'web') return;
    void startRangefinderWatch();
    return () => {
      stopRangefinderWatch();
    };
  }, [visible, startRangefinderWatch, stopRangefinderWatch]);

  const userLocation = rangefinderLocation ?? null;
  const initialCenter = userLocation ?? coords ?? courseLocation;
  const yards =
    userLocation && target ? distanceYards(userLocation, target) : null;
  const accuracyYards =
    userLocation?.accuracyMeters == null
      ? null
      : Math.round(userLocation.accuracyMeters * METERS_TO_YARDS);
  const accuracyLabel = formatAccuracy(userLocation?.accuracyMeters);
  const accuracyPoor =
    accuracyYards != null && accuracyYards > POOR_ACCURACY_YARDS;
  const showPermissionActions =
    Platform.OS !== 'web' && (status === 'denied' || status === 'unavailable');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow} numberOfLines={1}>
                HOLE {holeNumber} · PAR {par}
                {yardage ? ` · ${yardage} YD` : ''}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                Rangefinder
              </Text>
              <Text style={styles.courseName} numberOfLines={1}>
                {courseName}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.mapFrame}>
            <RangefinderMap
              userLocation={userLocation}
              targetLocation={target}
              initialCenter={initialCenter}
              accuracyMeters={userLocation?.accuracyMeters}
              onTargetChange={setTarget}
            />
          </View>

          <View style={styles.footer}>
            <View style={styles.distanceBlock}>
              <Text style={styles.distanceLabel}>
                {target ? 'GPS TO MARKER' : 'TAP THE MAP'}
              </Text>
              <Text style={styles.distanceValue}>
                {yards == null ? '—' : formatYards(yards)}
              </Text>
            </View>
            <View style={styles.statusBlock}>
              {accuracyLabel ? (
                <Text
                  style={[
                    styles.accuracy,
                    accuracyPoor && styles.accuracyPoor,
                  ]}>
                  {accuracyLabel}
                </Text>
              ) : (
                <Text style={styles.accuracy}>Finding GPS…</Text>
              )}
              <Text style={styles.hint}>
                {target
                  ? 'Tap map to adjust target'
                  : 'Tap green, bunker, or layup spot'}
              </Text>
            </View>
          </View>

          {accuracyPoor ? (
            <Text style={styles.warning}>
              Accuracy is low right now. Move outdoors and wait for GPS to settle.
            </Text>
          ) : null}

          {rangefinderError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{rangefinderError}</Text>
              {showPermissionActions ? (
                <View style={styles.errorActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => void startRangefinderWatch()}>
                    <Text style={styles.secondaryBtnText}>Try again</Text>
                  </Pressable>
                  {status === 'denied' ? (
                    <Pressable
                      style={styles.primaryBtn}
                      onPress={() => void openSystemSettings()}>
                      <Text style={styles.primaryBtnText}>Open settings</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.42)',
    },
    sheet: {
      height: '88%',
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 14,
      paddingBottom: 14,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -4 },
      elevation: 8,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginTop: 10,
      marginBottom: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingBottom: 10,
    },
    headerText: {
      flex: 1,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.7,
      color: colors.primaryDark,
    },
    title: {
      marginTop: 1,
      fontSize: 23,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.4,
    },
    courseName: {
      marginTop: 1,
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    closeBtn: {
      fontSize: 18,
      fontWeight: '900',
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    mapFrame: {
      flex: 1,
      minHeight: 320,
      overflow: 'hidden',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
    },
    footer: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      marginTop: 12,
      padding: 12,
      borderRadius: 16,
      backgroundColor: colors.chipBg,
    },
    distanceBlock: {
      minWidth: 116,
    },
    distanceLabel: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.7,
      color: colors.textMuted,
    },
    distanceValue: {
      marginTop: 1,
      fontSize: 32,
      lineHeight: 34,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -1,
    },
    statusBlock: {
      flex: 1,
      alignItems: 'flex-end',
    },
    accuracy: {
      fontSize: 12,
      fontWeight: '900',
      color: colors.primaryDark,
    },
    accuracyPoor: {
      color: colors.accent,
    },
    hint: {
      marginTop: 3,
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'right',
    },
    warning: {
      marginTop: 8,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
      color: colors.accent,
      textAlign: 'center',
    },
    errorBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
    },
    errorText: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'center',
    },
    errorActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 11,
      backgroundColor: colors.chipBg,
    },
    secondaryBtnText: {
      fontSize: 12,
      fontWeight: '900',
      color: colors.textTitle,
    },
    primaryBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 11,
      backgroundColor: colors.primary,
    },
    primaryBtnText: {
      fontSize: 12,
      fontWeight: '900',
      color: '#fff',
    },
  });
}
