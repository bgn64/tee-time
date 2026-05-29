/**
 * ScorerRow — one row per scorer, used across all four detail-view
 * states (① completed view / ② live edit / ③ completed edit / ④
 * live view). In stroke mode that's one row per player; in scramble
 * that's one row per team, with the avatar cluster carrying all
 * team members.
 *
 * Two-line layout (unchanged across editing / viewing):
 *   Line 1: [avatar(s)]  [name (flex: 1)]  [running/final tint chip]
 *   Line 2: [tee pill]  [score buttons (flex-end, editing only)]
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
 *     - Tee pill is interactive (chev visible, tap fires `onPressTee`).
 *     - **When `tee` is undefined, a dashed `+ Tee` placeholder is
 *       rendered so the picker is reachable.** This fixes the bug
 *       where a round started without picking a tee left the user
 *       with no way to set one mid-round.
 *     - Score buttons render to the right of the tee pill.
 *
 * The quick-pick chip row shows relative-to-par values
 * (−2 / −1 / E / +1 / +2). Tapping a chip sets the score. A sixth
 * `✕` chip opens the `CustomScoreSheet` for arbitrary values; once
 * a score outside −2…+2 is set, that chip displays the actual value
 * (`+4`, `−3`) and tapping it re-opens the sheet.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CustomScoreSheet } from '@/components/scoring/CustomScoreSheet';
import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { teeSwatch } from '@/components/scoring/TeePickerSheet';
import { formatScore } from '@/library/golf/scoring';
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
  /** Fires when the tee pill is tapped. Only wired in editing mode. */
  onPressTee?: () => void;
  /**
   * True when the row should expose score-entry affordances (buttons
   * + interactive tee pill, including the "+ Tee" placeholder).
   * False renders the row in viewing mode.
   */
  isEditing: boolean;
  /** Current hole context for the score-entry chips. Unused when viewing. */
  holeNumber: number;
  par: number;
  strokes: number | null;
  /** Required when isEditing; ignored when viewing. */
  onChange?: (strokes: number) => void;
};

const QUICK_PICKS: readonly { rel: number; label: string }[] = [
  { rel: -2, label: '−2' },
  { rel: -1, label: '−1' },
  { rel: 0, label: 'E' },
  { rel: 1, label: '+1' },
  { rel: 2, label: '+2' },
];

export function ScorerRow({
  members,
  name,
  runningText,
  runningTone,
  thruText,
  tee,
  onPressTee,
  isEditing,
  holeNumber,
  par,
  strokes,
  onChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sheetOpen, setSheetOpen] = useState(false);

  const rel = strokes === null ? null : strokes - par;
  const customActive = rel !== null && (rel > 2 || rel < -2);

  const handleQuickPick = (relVal: number) => {
    onChange?.(Math.max(1, par + relVal));
  };

  const sheetHeading = name ?? members.map((m) => m.name).filter(Boolean).join(' & ');

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

  // Tee pill rendering decision tree:
  //   editing + tee: interactive pill with swatch + name + chev.
  //   editing + no tee: dashed "+ Tee" placeholder (bug fix — was
  //     previously hidden, leaving the picker unreachable).
  //   viewing + tee: static pill with swatch + name.
  //   viewing + no tee: nothing.
  let teePill: React.ReactNode = null;
  if (isEditing) {
    const interactiveLabel = tee ? `Change tee from ${tee.name}` : 'Pick a tee';
    teePill = (
      <Pressable
        onPress={onPressTee}
        style={tee ? styles.teePill : styles.teePillEmpty}
        accessibilityRole="button"
        accessibilityLabel={interactiveLabel}>
        {tee ? (
          <>
            <View style={[styles.teeDot, { backgroundColor: teeSwatch(tee) }]} />
            <Text style={styles.teeName} numberOfLines={1}>
              {tee.name}
            </Text>
            <Text style={styles.teeChev}>▾</Text>
          </>
        ) : (
          <>
            <Text style={styles.teePlaceholder}>+ Tee</Text>
            <Text style={styles.teeChev}>▾</Text>
          </>
        )}
      </Pressable>
    );
  } else if (tee) {
    teePill = (
      <View style={styles.teePill}>
        <View style={[styles.teeDot, { backgroundColor: teeSwatch(tee) }]} />
        <Text style={styles.teeName} numberOfLines={1}>
          {tee.name}
        </Text>
      </View>
    );
  }

  // Line 2 is omitted entirely when viewing AND there's no tee to show
  // (avoids reserving empty vertical space below an identity-only row).
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
              {QUICK_PICKS.map((q) => {
                const isActive = rel === q.rel;
                return (
                  <Pressable
                    key={q.rel}
                    onPress={() => handleQuickPick(q.rel)}
                    style={[
                      styles.chip,
                      isActive && (q.rel > 0 ? styles.chipActiveOver : styles.chipActive),
                    ]}
                    hitSlop={2}>
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {q.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setSheetOpen(true)}
                style={[
                  styles.chip,
                  customActive && (rel! > 0 ? styles.chipActiveOver : styles.chipActive),
                ]}
                hitSlop={2}>
                <Text style={[styles.chipText, customActive && styles.chipTextActive]}>
                  {customActive ? formatScore(rel!) : '✕'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {isEditing ? (
        <CustomScoreSheet
          visible={sheetOpen}
          scorerName={sheetHeading}
          holeNumber={holeNumber}
          par={par}
          initialStrokes={strokes}
          onCancel={() => setSheetOpen(false)}
          onConfirm={(v) => {
            setSheetOpen(false);
            onChange?.(v);
          }}
        />
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
    teePillEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
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
    teePlaceholder: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    teeChev: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.textMuted,
      marginLeft: 1,
    },
    controls: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    chip: {
      height: 38,
      minWidth: 40,
      paddingHorizontal: 6,
      borderRadius: 9,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      backgroundColor: colors.primary,
    },
    chipActiveOver: {
      backgroundColor: colors.accent,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primaryDark,
    },
    chipTextActive: {
      color: '#fff',
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
