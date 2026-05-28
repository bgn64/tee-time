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
 *     and becomes a Pressable. Everything inside (chips + tee pill)
 *     is dimmed and non-interactive via `pointerEvents: 'none'` on
 *     the wrapping flex container — taps fall through to the
 *     bucket-level handler.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import { teeSwatch } from '@/components/scoring/TeePickerSheet';
import { PlayerChip } from './PlayerChip';
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

  const rowStyles = [
    styles.row,
    {
      backgroundColor: colors.cardBg,
      borderColor: isDestination ? colors.accent : colors.border,
    },
    isDestination && styles.rowDestination,
  ];

  // The chips + tee pill content. In destination mode this whole
  // block is non-interactive (pointerEvents: 'none' via style) so
  // taps fall through to the outer Pressable.
  const inner = (
    <View
      style={[
        styles.inner,
        isDestination && styles.innerDimmed,
        isDestination && { pointerEvents: 'none' as const },
      ]}>
      <View style={styles.chipList}>
        {members.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            No players yet
          </Text>
        ) : (
          members.map((m) => (
            <PlayerChip
              key={m.id}
              name={m.name}
              color={m.color}
              active={selectedPlayerId === m.id}
              onPress={() => onTapChip(m.id)}
            />
          ))
        )}
      </View>
      {onPickTee ? (
        <Pressable
          onPress={onPickTee}
          style={[
            styles.teePill,
            tee
              ? { backgroundColor: colors.chipBg }
              : { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={tee ? `Change tee from ${tee.name}` : 'Pick a tee'}>
          {tee ? (
            <>
              <View
                style={[
                  styles.teeDot,
                  { backgroundColor: teeSwatch(tee) },
                ]}
              />
              <Text style={[styles.teeText, { color: colors.textTitle }]} numberOfLines={1}>
                {tee.name}
              </Text>
            </>
          ) : (
            <Text style={[styles.teeTextEmpty, { color: colors.textMuted }]}>+ Tee</Text>
          )}
          <Text style={[styles.teeChev, { color: colors.textMuted }]}>▾</Text>
        </Pressable>
      ) : null}
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

const styles = StyleSheet.create({
  row: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
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
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    flexShrink: 0,
  },
  teeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  teeTextEmpty: {
    fontSize: 11,
    fontWeight: '700',
  },
  teeChev: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyHint: {
    fontSize: 11,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
});
