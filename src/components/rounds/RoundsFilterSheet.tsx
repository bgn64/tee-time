/**
 * Bottom-sheet modal that exposes the Rounds-tab filters: hole range
 * and date range. No format filter yet (scramble was just added; if a
 * stroke-vs-scramble filter is needed later, slot it in here).
 *
 * Selections apply live (no Apply button). Header carries a
 * Clear-all link + close button. Pinned to the bottom of the screen
 * via a slide-up modal.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';

/**
 * `'any'` collapses the filter (matches every row); the other
 * values map 1:1 onto `Round.holeRange === 'all' | 'front9' | 'back9'`.
 * `'all'` is labelled "All holes" rather than the old app's
 * "18 holes" because on a 9-hole course `holeRange === 'all'` means
 * 9 holes, not 18.
 */
export type RoundsRangeFilter = 'any' | 'all' | 'front9' | 'back9';

export type RoundsDateFilter = 'any' | 'last30' | 'last90' | 'thisYear';

export type RoundsFilters = {
  range: RoundsRangeFilter;
  date: RoundsDateFilter;
};

export const DEFAULT_ROUNDS_FILTERS: RoundsFilters = {
  range: 'any',
  date: 'any'
};

export function countActiveFilters(f: RoundsFilters): number {
  let n = 0;
  if (f.range !== DEFAULT_ROUNDS_FILTERS.range) n++;
  if (f.date !== DEFAULT_ROUNDS_FILTERS.date) n++;
  return n;
}

const RANGE_OPTIONS: readonly { value: RoundsRangeFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'all', label: 'All holes' },
  { value: 'front9', label: 'Front 9' },
  { value: 'back9', label: 'Back 9' }
];

const DATE_OPTIONS: readonly { value: RoundsDateFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisYear', label: 'This year' }
];

type Props = {
  visible: boolean;
  filters: RoundsFilters;
  onChange: (next: RoundsFilters) => void;
  onClose: () => void;
};

export function RoundsFilterSheet({ visible, filters, onChange, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const activeCount = countActiveFilters(filters);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            <View style={styles.headerRight}>
              {activeCount > 0 ? (
                <Pressable onPress={() => onChange(DEFAULT_ROUNDS_FILTERS)} hitSlop={8}>
                  <Text style={styles.clearLink}>Clear all</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>
          </View>

          <Section
            label="Hole range"
            options={RANGE_OPTIONS}
            value={filters.range}
            onPick={(v) => onChange({ ...filters, range: v })}
            styles={styles}
          />

          <Section
            label="Date"
            options={DATE_OPTIONS}
            value={filters.date}
            onPick={(v) => onChange({ ...filters, date: v })}
            styles={styles}
          />

          <View style={{ height: 12 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section<T extends string>({
  label,
  options,
  value,
  onPick,
  styles
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (next: T) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onPick(opt.value)}
              style={[styles.chip, isActive && styles.chipActive]}>
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.32)',
      justifyContent: 'flex-end'
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 22
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 14
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.textTitle
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16
    },
    clearLink: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.3
    },
    closeBtn: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700'
    },
    section: {
      marginTop: 18
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 8
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary
    },
    chipText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textTitle
    },
    chipTextActive: {
      color: '#ffffff'
    }
  });
}
