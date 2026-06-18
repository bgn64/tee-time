/**
 * ScorerRow — one row per scorer, used across all four detail-view
 * states (① completed view / ② live edit / ③ completed edit / ④
 * live view). In stroke mode that's one row per player; in scramble
 * that's one row per team, with the avatar cluster carrying all
 * team members.
 *
 * Two-line layout:
 *   Line 1: [avatar(s)]  [name (flex: 1)]  [running/final tint chip]
 *   Line 2: viewing shows a static tee pill when known; editing shows
 *           the raw-stroke Aurora Stepper.
 *
 * `isEditing` drives the differences:
 *
 *   isEditing=false (viewing):
 *     - Tee pill is static (no chev, no tap handler).
 *     - When `tee` is undefined, line 2 collapses entirely (no
 *       affordance to add a tee from a viewing surface anyway).
 *     - Score buttons are hidden.
 *
 *   isEditing=true (editing):
 *     - Per-player tee controls are omitted; tees are treated as
 *       round-level presentation.
 *     - The Stepper writes raw stroke counts through the parent handler.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Stepper } from '@/components/aurora';
import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { teeSwatch } from '@/components/scoring/TeePickerSheet';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Tee } from '@/types/golf';

type RunningTone = 'over' | 'under' | 'even';

type Props = {
  members: readonly AvatarMember[];
  /** Display name shown next to the cluster. */
  name?: string;
  /** Score chip text (e.g. "+1", "−2", "E"). */
  runningText?: string;
  runningTone?: RunningTone;
  /** Sub-label rendered next to the score chip, e.g. "THRU 7" while in-progress. */
  thruText?: string;
  /** This scorer's tee. */
  tee?: Tee;
  /** Accepted for API compatibility; editing rows no longer render a tee selector. */
  onPressTee?: () => void;
  /**
   * True when the row should expose score-entry affordances.
   * False renders the row in viewing mode.
   */
  isEditing: boolean;
  /** Current hole context for legacy callers. Unused by the Stepper UI. */
  holeNumber: number;
  par: number;
  strokes: number | null;
  /** Required when isEditing; ignored when viewing. */
  onChange?: (strokes: number) => void;
};

export function ScorerRow({
  members,
  name,
  runningText,
  runningTone,
  thruText,
  tee,
  isEditing,
  par,
  strokes,
  onChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const stepperValue = strokes ?? Math.max(1, par);

  // Score chip on line 1. Tone-tinted background, optional THRU sub-label.
  const runningChip = runningText ? (
    <View style={styles.runningWrap}>
      <View
        style={[
          styles.runningChip,
          runningTone && styles[`runningChip_${runningTone}` as const],
        ]}>
        <Text
          style={[
            styles.runningText,
            runningTone && styles[`runningText_${runningTone}` as const],
          ]}>
          {runningText}
        </Text>
      </View>
      {thruText ? <Text style={styles.thruText}>{thruText}</Text> : null}
    </View>
  ) : null;

  // Viewing surfaces may still show the scorer's tee. Editing surfaces
  // use a round-level tee convention, so no per-player tee selector renders.
  let teePill: React.ReactNode = null;
  if (!isEditing && tee) {
    teePill = (
      <View style={styles.teePill}>
        <View style={[styles.teeDot, { backgroundColor: teeSwatch(tee, colors) }]} />
        <Text style={styles.teeName} numberOfLines={1}>
          {tee.name}
        </Text>
      </View>
    );
  }

  const showLine2 = isEditing || tee !== undefined;

  return (
    <View style={styles.row}>
      {/* Line 1 */}
      <View style={styles.line1}>
        <TeamAvatarCluster members={members} size="md" ringColor={colors.cardBg} />
        {name ? (
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        ) : (
          <View style={styles.nameFill} />
        )}
        {runningChip}
      </View>

      {/* Line 2 */}
      {showLine2 ? (
        <View style={styles.line2}>
          {teePill}
          {isEditing ? (
            <View style={styles.controls}>
              <Stepper
                value={stepperValue}
                min={1}
                displayValue={strokes == null ? '–' : String(strokes)}
                onDecrement={() => onChange?.(Math.max(1, stepperValue - 1))}
                onIncrement={() =>
                  onChange?.(strokes == null ? stepperValue : stepperValue + 1)
                }
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      paddingVertical: 8,
      gap: 8,
    },
    line1: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    line2: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontSize: 15,
      fontWeight: '800',
      color: colors.textTitle,
    },
    nameFill: { flex: 1 },
    runningWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    runningChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      minWidth: 36,
      alignItems: 'center',
    },
    runningChip_over: { backgroundColor: withAlpha(colors.accent, 0.12) },
    runningChip_under: { backgroundColor: withAlpha(colors.primaryDark, 0.12) },
    runningChip_even: { backgroundColor: 'transparent' },
    runningText: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
      color: colors.textTitle,
    },
    runningText_over: { color: colors.accent },
    runningText_under: { color: colors.primaryDark },
    runningText_even: { color: colors.textBody },
    thruText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
    teePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
    },
    teeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    teeName: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textTitle,
    },
    controls: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
  });
}

function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
