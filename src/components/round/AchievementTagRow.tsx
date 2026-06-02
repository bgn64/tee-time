/**
 * AchievementTagRow — renders the "Did well" + "Hurt me" + (scramble)
 * tag-chip clusters with three modes:
 *
 *   - `read`  : Only tags in `tags` render. Static chips, not pressable.
 *               Used on the feed Holes tab.
 *   - `edit`  : All `enabledTags` render. Each chip is pressable —
 *               tap to toggle. Tapped chips render in the group's
 *               accent (green for did_well, accent-red for hurt_me).
 *   - `filter`: All `availableTags` render. Pressable; tap to enable /
 *               disable for the round. Used by Phase 5's gear panel.
 *               Phase 4 ships the prop signature so Phase 5 only needs
 *               to wire data; no rendering work in Phase 5.
 *
 * Layout: a small vertical stack of two (or three for scramble) tag
 * groups; each group has a tiny label ("DID WELL" / "HURT ME" /
 * "WHOSE SHOTS") and a horizontal wrap of chips. Untapped chips in
 * `edit` mode are muted; tapped chips in `edit` mode pick up the
 * group colour. In `read` mode, only tapped chips render at all
 * (untapped = absent per mockup §6).
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ACHIEVEMENT_TAGS,
  type AchievementTag,
  type TagGroup,
  type TagKey,
} from '@/library/golf/achievementTags';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Mode = 'read' | 'edit' | 'filter';

type Props = {
  mode: Mode;
  /**
   * `read`/`edit`: tags currently tapped for this (scorer, hole).
   * `filter`: tags currently enabled for this scorer in this round.
   */
  tags: readonly TagKey[];
  /**
   * Subset of `ACHIEVEMENT_TAGS` to render. In `edit` mode this is
   * the per-scorer enabled set (defaults from `defaultEnabledTagsFor`
   * unless Phase 5 overrides override). In `filter` mode this is the
   * full available set (everything not scramble-only on stroke
   * rounds; everything on scramble). In `read` mode this is unused —
   * we render whatever's in `tags`.
   */
  enabledTags?: readonly TagKey[];
  /** Required for `edit` mode and `filter` mode. */
  onToggle?: (tagKey: TagKey) => void;
  /** True for scramble rounds — controls whether the "Whose shots" group renders. */
  isScramble?: boolean;
};

export function AchievementTagRow({
  mode,
  tags,
  enabledTags,
  onToggle,
  isScramble = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const groups = useMemo<
    { group: TagGroup; label: string; tagsToRender: AchievementTag[] }[]
  >(() => {
    const visibleSet: Set<TagKey> | null = (() => {
      if (mode === 'read') return new Set(tags);
      if (mode === 'edit') return enabledTags ? new Set(enabledTags) : null;
      // filter mode: every available tag for the scoring rule.
      return null;
    })();

    const filter = (g: TagGroup): AchievementTag[] => {
      const list: AchievementTag[] = [];
      for (const t of ACHIEVEMENT_TAGS) {
        if (t.group !== g) continue;
        if (t.scrambleOnly && !isScramble) continue;
        if (visibleSet && !visibleSet.has(t.key)) continue;
        list.push(t);
      }
      return list;
    };

    const out: { group: TagGroup; label: string; tagsToRender: AchievementTag[] }[] = [];
    out.push({ group: 'did_well', label: 'Did well', tagsToRender: filter('did_well') });
    out.push({ group: 'hurt_me', label: 'Hurt me', tagsToRender: filter('hurt_me') });
    if (isScramble) {
      out.push({ group: 'scramble_only', label: 'Whose shots', tagsToRender: filter('scramble_only') });
    }
    return out;
  }, [mode, tags, enabledTags, isScramble]);

  // Render nothing in read mode when no tags were tapped at all.
  if (mode === 'read' && tags.length === 0) {
    return null;
  }

  const tappedSet = mode === 'edit' ? new Set(tags) : null;

  return (
    <View style={styles.wrap}>
      {groups.map((g) => {
        if (g.tagsToRender.length === 0) return null;
        return (
          <View key={g.group} style={styles.group}>
            {mode !== 'read' ? (
              <Text style={styles.groupLabel}>{g.label.toUpperCase()}</Text>
            ) : null}
            <View style={styles.cluster}>
              {g.tagsToRender.map((tag) => {
                const isTapped = tappedSet?.has(tag.key) ?? false;
                const onPress =
                  mode === 'edit' || mode === 'filter'
                    ? () => onToggle?.(tag.key)
                    : undefined;
                return (
                  <Pressable
                    key={tag.key}
                    onPress={onPress}
                    disabled={!onPress}
                    accessibilityRole={onPress ? 'button' : undefined}
                    style={[
                      styles.chip,
                      isTapped && g.group === 'did_well'
                        ? styles.chipDidWell
                        : null,
                      isTapped && g.group === 'hurt_me'
                        ? styles.chipHurtMe
                        : null,
                      isTapped && g.group === 'scramble_only'
                        ? styles.chipDidWell
                        : null,
                    ]}>
                    {isTapped ? (
                      <Text
                        style={[
                          styles.chipPrefix,
                          g.group === 'hurt_me' ? styles.chipPrefixHurt : null,
                        ]}>
                        {g.group === 'hurt_me' ? '!' : '✓'}
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.chipText,
                        isTapped ? styles.chipTextTapped : null,
                      ]}>
                      {tag.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'column',
      gap: 10,
    },
    group: {
      flexDirection: 'column',
      gap: 6,
    },
    groupLabel: {
      fontSize: 9.5,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    cluster: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
    },
    chipDidWell: {
      backgroundColor: colors.primary,
    },
    chipHurtMe: {
      backgroundColor: colors.accent,
    },
    chipPrefix: {
      fontSize: 10,
      fontWeight: '900',
      color: '#fff',
    },
    chipPrefixHurt: {
      color: '#fff',
    },
    chipText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: colors.textMuted,
    },
    chipTextTapped: {
      color: '#fff',
    },
  });
}
