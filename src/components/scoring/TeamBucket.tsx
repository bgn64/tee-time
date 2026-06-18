/**
 * TeamBucket — one row of the stacked scramble team-config list. The
 * layout mirrors the stroke flow's per-player rows: avatars/chips on
 * the left, tee pill on the right, no header, no count, no top
 * accent bar. The team is identified by its members' chips.
 *
 * Selection-mode treatment:
 *   - The row containing the selected chip gets no row-level
 *     treatment — the chip's own accent outline (via PlayerChip's
 *     `active` prop) is the only cue. Chips remain interactive so
 *     the user can tap the selected chip to deselect, or tap a
 *     teammate to switch selection.
 *   - `isDestination` (a chip is selected and this row isn't its
 *     source): the entire row renders with an accent dashed border
 *     and becomes a Pressable. Chips are rendered with
 *     `onPress={undefined}` (PlayerChip falls back to a plain View)
 *     and the tee pill is rendered as a static View — so no
 *     `<button>` lives inside the outer Pressable on react-native-web
 *     (which would be invalid HTML). Contents are dimmed to 0.55
 *     opacity so the user reads the row as one tap target.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import { teeSwatch } from '@/components/scoring/TeePickerSheet';
import { PlayerChip } from './PlayerChip';
import type { ThemeColors } from '@/library/theme/themes';
import type { Tee } from '@/types/golf';

export type BucketMember = {
  id: string;
  name: string;
  color: string;
};

type Props = {
  members: readonly BucketMember[];
  /** The team's currently-selected tee, if any. */
  tee?: Tee;
  /** Pass `null` to hide the tee pill entirely. */
  onPickTee?: (() => void) | null;
  /** Which member chip is currently selected (active outline). */
  selectedPlayerId?: string | null;
  /** True when a chip is selected elsewhere and this row is a valid destination. */
  isDestination?: boolean;
  /** Fires when the row is tapped while in destination mode. */
  onTapBucket?: (() => void) | null;
  onTapChip: (playerId: string) => void;
};

export function TeamBucket({
  members,
  tee,
  onPickTee,
  selectedPlayerId,
  isDestination = false,
  onTapBucket,
  onTapChip,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const rowStyles = [
    styles.row,
    isDestination ? styles.rowDestinationColor : styles.rowBaseColor,
    isDestination && styles.rowDestination,
  ];

  // The chips + tee pill content. In destination mode we render
  // chips with `onPress={undefined}` (they fall back to plain Views)
  // and the tee pill as a static View — so no `<button>` lives
  // inside the outer Pressable on react-native-web. Visual cue is
  // the opacity-0.55 dimming on the wrapper.
  const teePill =
    isDestination && tee ? (
      <View style={styles.teePill}>
        <View style={[styles.teeDot, { backgroundColor: teeSwatch(tee, colors) }]} />
        <Text style={styles.teeText} numberOfLines={1}>
          {tee.name}
        </Text>
      </View>
    ) : !isDestination && onPickTee ? (
      <Pressable
        onPress={onPickTee}
        style={[
          styles.teePill,
          tee
            ? null
            : styles.teePillEmpty,
        ]}
        accessibilityRole="button"
        accessibilityLabel={tee ? `Change tee from ${tee.name}` : 'Pick a tee'}>
        {tee ? (
          <>
            <View style={[styles.teeDot, { backgroundColor: teeSwatch(tee, colors) }]} />
            <Text style={styles.teeText} numberOfLines={1}>
              {tee.name}
            </Text>
          </>
        ) : (
          <Text style={styles.teeTextEmpty}>+ Tee</Text>
        )}
        <Text style={[styles.teeChev, { color: colors.textMuted }]}>▾</Text>
      </Pressable>
    ) : null;

  const inner = (
    <View style={[styles.inner, isDestination && styles.innerDimmed]}>
      <View style={styles.chipList}>
        {members.length === 0 ? (
          <Text style={styles.emptyHint}>
            No players yet
          </Text>
        ) : (
          members.map((m) => (
            <PlayerChip
              key={m.id}
              name={m.name}
              color={m.color}
              active={selectedPlayerId === m.id}
              onPress={isDestination ? undefined : () => onTapChip(m.id)}
            />
          ))
        )}
      </View>
      {teePill}
    </View>
  );

  if (onTapBucket) {
    return (
      <Pressable
        onPress={onTapBucket}
        accessibilityRole="button"
        accessibilityLabel="Move selected player into this team"
        style={({ pressed }) => [
          ...rowStyles,
          pressed && { opacity: 0.85 },
        ]}>
        {inner}
      </Pressable>
    );
  }

  return <View style={rowStyles}>{inner}</View>;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 12,
      shadowColor: colors.cyan,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
    },
    rowBaseColor: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassStroke,
    },
    rowDestinationColor: {
      backgroundColor: colors.glowCyan,
      borderColor: colors.cyan,
    },
    rowDestination: {
      borderWidth: 1.5,
      borderStyle: 'dashed',
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    innerDimmed: {
      opacity: 0.55,
    },
    chipList: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    teePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      flexShrink: 0,
      backgroundColor: colors.night,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    teePillEmpty: {
      backgroundColor: 'transparent',
      borderColor: colors.glassStroke,
      borderStyle: 'dashed',
    },
    teeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    teeText: {
      color: colors.textTitle,
      fontSize: 11,
      fontWeight: '800',
    },
    teeTextEmpty: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    teeChev: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
    },
    emptyHint: {
      color: colors.textMuted,
      fontSize: 11,
      fontStyle: 'italic',
      paddingVertical: 6,
    },
  });
}
