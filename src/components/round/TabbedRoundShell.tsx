/**
 * TabbedRoundShell — owns the segmented Summary · Scorecard · Holes
 * tab state and renders the active tab's body.
 *
 * The segmented selector is tap-only: no chevrons, no swipe — the
 * redesign is web-first and swipe behaviour is unreliable on
 * desktop, so we deliberately don't ship it.
 *
 * Default tab is always Summary on every mount. The plan locked in
 * "no persistence across navigation" — every entry to the feed card
 * or scoring screen lands on Summary again, so each scorer's
 * surface reads consistently and there's no hidden state to track.
 *
 * Children are slotted by tab name. Each slot may be a React node
 * or a thunk (deferred render) so the inactive tabs don't have to
 * mount their full subtree (Scorecard in particular is expensive
 * once Phase 2 lands the per-tee grouped renderer).
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type TabKey = 'summary' | 'scorecard' | 'holes';

type TabSlot = ReactNode | (() => ReactNode);

type Props = {
  summary: TabSlot;
  scorecard: TabSlot;
  holes: TabSlot;
  /** Optional override for the initial tab. Defaults to 'summary'. */
  defaultTab?: TabKey;
};

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: 'summary', label: 'SUMMARY' },
  { key: 'scorecard', label: 'SCORECARD' },
  { key: 'holes', label: 'HOLES' },
];

export function TabbedRoundShell({
  summary,
  scorecard,
  holes,
  defaultTab = 'summary',
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [active, setActive] = useState<TabKey>(defaultTab);

  const slot =
    active === 'summary' ? summary : active === 'scorecard' ? scorecard : holes;

  return (
    <View>
      <View style={styles.pager}>
        <View style={styles.segmented}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActive(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[styles.seg, isActive ? styles.segActive : null]}>
                <Text
                  style={[
                    styles.segLabel,
                    isActive ? styles.segLabelActive : null,
                  ]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View>{typeof slot === 'function' ? slot() : slot}</View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pager: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 8,
    },
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    seg: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      borderRadius: 7,
    },
    segActive: {
      backgroundColor: colors.cardBg,
      // Subtle inset shadow on web; on native we just rely on the
      // background contrast since RN doesn't render shadows on
      // small inline elements consistently.
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 2,
      elevation: 1,
    },
    segLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    segLabelActive: {
      color: colors.primaryDark,
    },
  });
}
