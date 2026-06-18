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
import { StyleSheet, View } from 'react-native';

import { SegmentedToggle } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type TabKey = 'summary' | 'scorecard' | 'holes';

type TabSlot = ReactNode | (() => ReactNode);

type Props = {
  summary: TabSlot;
  scorecard: TabSlot;
  /**
   * Optional Holes tab. When omitted (e.g. round-views in viewing
   * mode for a round with no per-hole stat data), the segmented
   * control hides the HOLES button entirely so the surface doesn't
   * advertise an empty tab.
   */
  holes?: TabSlot;
  /** Optional override for the initial tab. Defaults to 'summary'. */
  defaultTab?: TabKey;
};

const ALL_TABS: readonly { key: TabKey; label: string }[] = [
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

  const tabs = useMemo(
    () => ALL_TABS.filter((t) => t.key !== 'holes' || holes !== undefined),
    [holes]
  );

  const [active, setActive] = useState<TabKey>(defaultTab);

  // If the active tab disappears (defensive: holes slot was wired
  // earlier in the render tree but isn't now), fall back to summary
  // so we don't render an unrelated slot.
  const effectiveActive = tabs.some((t) => t.key === active)
    ? active
    : 'summary';

  const slot =
    effectiveActive === 'summary'
      ? summary
      : effectiveActive === 'scorecard'
        ? scorecard
        : holes;

  return (
    <View>
      <View style={styles.pager}>
        <SegmentedToggle
          options={tabs.map((tab) => ({ key: tab.key, label: tab.label }))}
          value={effectiveActive}
          onChange={setActive}
        />
      </View>
      <View>{typeof slot === 'function' ? slot() : slot}</View>
    </View>
  );
}

function makeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    pager: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
    },
  });
}
