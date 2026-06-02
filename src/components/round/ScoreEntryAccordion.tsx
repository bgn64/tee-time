/**
 * ScoreEntryAccordion — per-scorer entry block for the scoring
 * Holes tab. Replaces the ScorerStack pattern that Phase 1 mounted
 * inline:
 *
 *   [ScorerRow with score chips]
 *   [Detail ▸ (right-aligned)]
 *     ↓ when expanded
 *   [AchievementTagRow mode="edit"]
 *
 * The Detail accordion is collapsed by default; tapping the toggle
 * shows the tag editor. Per Q5 decision, there's no "reset to
 * defaults" button — the user can toggle individual tags to land
 * any subset they want. Phase 5 adds the gear toggle inside the
 * accordion body to switch into filter mode.
 *
 * State: accordion open/closed is local per scorer per round
 * lifetime. We deliberately don't persist it across navigation —
 * the user re-opens whichever rows they need each time they enter
 * the Holes tab. (Matches the no-tab-persistence convention from
 * Phase 1.)
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AchievementTagRow } from './AchievementTagRow';
import { ScorerRow } from './ScorerRow';
import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import {
  defaultEnabledTagsFor,
  type TagKey,
} from '@/library/golf/achievementTags';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { ScoringRule, Tee } from '@/types/golf';

type Props = {
  // ScorerRow props (passed through)
  members: readonly AvatarMember[];
  name?: string;
  runningText?: string;
  runningTone?: 'over' | 'under' | 'even';
  thruText?: string;
  tee?: Tee;
  holeNumber: number;
  par: number;
  strokes: number | null;
  onChange?: (strokes: number) => void;
  onPressTee?: () => void;

  // Achievement-tag props
  scorerId: string;
  scoringRule: ScoringRule;
  /** Tags currently tapped for this (scorer, hole) tuple. */
  tappedTags: readonly TagKey[];
  /**
   * Tags enabled for this scorer in this round. Phase 4 always uses
   * `defaultEnabledTagsFor(scoringRule)`; Phase 5 wires per-scorer
   * overrides here. If null/undefined we fall back to defaults.
   */
  enabledTags?: readonly TagKey[] | null;
  onToggleTag: (tagKey: TagKey) => void;

  /** Optional slot for Phase 5's gear toggle (placeholder for now). */
  detailHeaderSlot?: ReactNode;
};

export function ScoreEntryAccordion({
  members,
  name,
  runningText,
  runningTone,
  thruText,
  tee,
  holeNumber,
  par,
  strokes,
  onChange,
  onPressTee,
  scorerId,
  scoringRule,
  tappedTags,
  enabledTags,
  onToggleTag,
  detailHeaderSlot,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const effectiveEnabled = useMemo(
    () => enabledTags ?? defaultEnabledTagsFor(scoringRule),
    [enabledTags, scoringRule]
  );

  return (
    <View style={styles.block}>
      <ScorerRow
        members={members}
        name={name}
        runningText={runningText}
        runningTone={runningTone}
        thruText={thruText}
        tee={tee}
        onPressTee={onPressTee}
        isEditing={true}
        holeNumber={holeNumber}
        par={par}
        strokes={strokes}
        onChange={onChange}
      />
      <View style={styles.detailBar}>
        {detailHeaderSlot}
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={styles.detailToggle}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? 'Hide per-hole detail' : 'Show per-hole detail'
          }
          accessibilityState={{ expanded }}>
          <Text style={styles.detailToggleLabel}>DETAIL</Text>
          <Text style={[styles.detailArrow, expanded ? styles.detailArrowOpen : null]}>
            ▸
          </Text>
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.accordionBody}>
          <AchievementTagRow
            mode="edit"
            tags={tappedTags}
            enabledTags={effectiveEnabled}
            isScramble={scoringRule === 'scramble'}
            onToggle={onToggleTag}
          />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    block: {
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    detailBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
      paddingHorizontal: 12,
      paddingTop: 2,
      paddingBottom: 4,
    },
    detailToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    detailToggleLabel: {
      fontSize: 10.5,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    detailArrow: {
      fontSize: 10,
      color: colors.textMuted,
    },
    detailArrowOpen: {
      transform: [{ rotate: '90deg' }],
    },
    accordionBody: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      backgroundColor: colors.chipBg,
    },
  });
}
