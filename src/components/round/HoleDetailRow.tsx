/**
 * HoleDetailRow — one per-stat input row, rendered as part of the
 * per-hole stat-entry stack on both the editing surface
 * (`ScoreEntryAccordion`) and the read-only viewing surface
 * (`HolesTabContent`).
 *
 * Two visual shapes driven by the stat's type:
 *
 *   - Binary: `[ Yes ] [ No ]` mutex chip pair. Selected Yes is
 *     coloured per `stat.yesTone` (good = green, bad = red,
 *     neutral = muted). Selected No is the inverse (good = muted,
 *     bad = green). Matches the scoring-chip "no revert to unset
 *     once tapped" convention — both buttons stay tappable to
 *     switch between values.
 *
 *   - Integer: chip row over `stat.quickPicks` plus a `✕` button
 *     that opens `CustomIntegerSheet` for out-of-range values.
 *     Selected chip uses the same neutral selected-chip styling
 *     regardless of stat tone — value-by-value coloring is
 *     deliberately deferred.
 *
 * Read-only mode (no `onChange` prop): renders the selected value
 * as a single read-only chip; unset stats show an em-dash.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CustomIntegerSheet } from '@/components/scoring/CustomIntegerSheet';
import type {
  StatDefinition,
  StatValue,
} from '@/library/golf/builtInStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  stat: StatDefinition;
  value: StatValue | null;
  /** When omitted, the row is read-only (no taps). */
  onChange?: (value: StatValue | null) => void;
  /** Used as the custom-integer sheet's subtitle. */
  scorerName?: string;
  /** Used as the custom-integer sheet's subtitle. */
  holeNumber?: number;
};

export function HoleDetailRow({
  stat,
  value,
  onChange,
  scorerName,
  holeNumber,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{stat.label}</Text>
      <View style={styles.controls}>
        {stat.type === 'binary' ? (
          <BinaryButtons
            stat={stat}
            value={typeof value === 'boolean' ? value : null}
            onChange={onChange}
            styles={styles}
          />
        ) : (
          <>
            <IntegerChips
              stat={stat}
              value={typeof value === 'number' ? value : null}
              onChange={onChange}
              onOpenCustom={() => setSheetOpen(true)}
              styles={styles}
            />
            {onChange ? (
              <CustomIntegerSheet
                visible={sheetOpen}
                title={`Custom ${stat.label}`}
                subtitle={
                  scorerName && holeNumber
                    ? `${scorerName} · Hole ${holeNumber}`
                    : undefined
                }
                initialValue={typeof value === 'number' ? value : null}
                min={Math.min(...(stat.quickPicks.length > 0 ? stat.quickPicks : [0]))}
                onCancel={() => setSheetOpen(false)}
                onConfirm={(v) => {
                  setSheetOpen(false);
                  onChange(v);
                }}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

type StylesShape = ReturnType<typeof makeStyles>;

function BinaryButtons({
  stat,
  value,
  onChange,
  styles,
}: {
  stat: Extract<StatDefinition, { type: 'binary' }>;
  value: boolean | null;
  onChange?: (value: StatValue | null) => void;
  styles: StylesShape;
}) {
  const yesActiveStyle =
    stat.yesTone === 'good'
      ? styles.chipActiveGood
      : stat.yesTone === 'bad'
        ? styles.chipActiveBad
        : styles.chipActiveNeutral;
  // "No" tone is the inverse of "yes" tone (good ↔ bad), neutral
  // stays neutral. Picked so selecting the positive outcome (No on
  // a hurt-me stat, Yes on a did-well stat) reads consistently.
  const noActiveStyle =
    stat.yesTone === 'good'
      ? styles.chipActiveNoOfGood
      : stat.yesTone === 'bad'
        ? styles.chipActiveGood
        : styles.chipActiveNeutral;

  const handlePress = (next: boolean) => {
    if (!onChange) return;
    // Matches the scoring chip convention: tapping the currently
    // selected value is a no-op (can't revert to unset). Switching
    // to the other value flips the boolean.
    if (value === next) return;
    onChange(next);
  };

  return (
    <View style={styles.binaryGroup}>
      <Pressable
        disabled={!onChange}
        onPress={() => handlePress(true)}
        style={[
          styles.chip,
          styles.binaryChip,
          value === true && yesActiveStyle,
        ]}>
        <Text
          style={[
            styles.chipText,
            value === true && styles.chipTextActive,
          ]}>
          Yes
        </Text>
      </Pressable>
      <Pressable
        disabled={!onChange}
        onPress={() => handlePress(false)}
        style={[
          styles.chip,
          styles.binaryChip,
          value === false && noActiveStyle,
        ]}>
        <Text
          style={[
            styles.chipText,
            value === false && styles.chipTextActive,
          ]}>
          No
        </Text>
      </Pressable>
    </View>
  );
}

function IntegerChips({
  stat,
  value,
  onChange,
  onOpenCustom,
  styles,
}: {
  stat: Extract<StatDefinition, { type: 'integer' }>;
  value: number | null;
  onChange?: (value: StatValue | null) => void;
  onOpenCustom: () => void;
  styles: StylesShape;
}) {
  // The picked value is "custom" when it's not in the quick-pick
  // set; the custom chip shows the value as a number in that case
  // so the user sees what's selected without re-opening the sheet.
  const valueIsQuickPick = value != null && stat.quickPicks.includes(value);
  const customActive = value != null && !valueIsQuickPick;

  return (
    <View style={styles.integerGroup}>
      {stat.quickPicks.map((q) => {
        const isActive = value === q;
        return (
          <Pressable
            key={q}
            disabled={!onChange}
            onPress={() => {
              if (!onChange) return;
              if (isActive) return;
              onChange(q);
            }}
            style={[
              styles.chip,
              styles.integerChip,
              isActive && styles.chipActiveNeutral,
            ]}>
            <Text
              style={[
                styles.chipText,
                isActive && styles.chipTextActive,
              ]}>
              {q}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        disabled={!onChange}
        onPress={onOpenCustom}
        style={[
          styles.chip,
          styles.integerChip,
          customActive && styles.chipActiveNeutral,
        ]}>
        <Text
          style={[
            styles.chipText,
            customActive && styles.chipTextActive,
          ]}>
          {customActive ? String(value) : '✕'}
        </Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    label: {
      flex: 1,
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textBody,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    binaryGroup: {
      flexDirection: 'row',
      gap: 4,
    },
    integerGroup: {
      flexDirection: 'row',
      gap: 4,
    },
    chip: {
      height: 34,
      minWidth: 38,
      paddingHorizontal: 10,
      borderRadius: 9,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    binaryChip: {
      minWidth: 48,
    },
    integerChip: {
      minWidth: 36,
    },
    chipActiveNeutral: {
      backgroundColor: colors.primary,
    },
    chipActiveGood: {
      backgroundColor: colors.primary,
    },
    chipActiveBad: {
      backgroundColor: colors.accent,
    },
    // "No on a did-well stat" = the negative outcome that's still
    // less loud than a bad event. Render with the same accent as
    // hurt-me's positive outcome but only as a quiet selected
    // state (the user did opt-in to track this miss).
    chipActiveNoOfGood: {
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
