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

  // In edit mode `tags` = the per-hole tapped set; in filter mode
  // `tags` = the per-scorer-per-round enabled set. Either way, the
  // chip is "on" when its key is in `tags`, but the visual is
  // different: edit mode fills the chip with the group's accent
  // colour, while filter mode uses a bordered toggle look so the
  // user can read at a glance whether the stat is enabled.
  const activeSet = mode === 'read' || mode === 'edit' || mode === 'filter'
    ? new Set(tags)
    : null;

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
                const isActive = activeSet?.has(tag.key) ?? false;
                const onPress =
                  mode === 'edit' || mode === 'filter'
                    ? () => onToggle?.(tag.key)
                    : undefined;

                if (mode === 'filter') {
                  return (
                    <Pressable
                      key={tag.key}
                      onPress={onPress}
                      disabled={!onPress}
                      accessibilityRole={onPress ? 'button' : undefined}
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`${tag.label} ${isActive ? 'enabled' : 'disabled'} — tap to toggle`}
                      style={[
                        styles.filterChip,
                        isActive ? styles.filterChipOn : styles.filterChipOff,
                      ]}>
                      <View
                        style={[
                          styles.filterPip,
                          isActive
                            ? styles.filterPipOn
                            : styles.filterPipOff,
                        ]}>
                        <Text
                          style={[
                            styles.filterPipText,
                            isActive
                              ? styles.filterPipTextOn
                              : styles.filterPipTextOff,
                          ]}>
                          {isActive ? '✓' : '−'}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.filterChipText,
                          isActive ? styles.filterChipTextOn : null,
                        ]}>
                        {tag.label}
                      </Text>
                    </Pressable>
                  );
                }

                return (
                  <Pressable
                    key={tag.key}
                    onPress={onPress}
                    disabled={!onPress}
                    accessibilityRole={onPress ? 'button' : undefined}
                    style={[
                      styles.chip,
                      isActive && g.group === 'did_well'
                        ? styles.chipDidWell
                        : null,
                      isActive && g.group === 'hurt_me'
                        ? styles.chipHurtMe
                        : null,
                      isActive && g.group === 'scramble_only'
                        ? styles.chipDidWell
                        : null,
                    ]}>
                    {isActive ? (
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
                        isActive ? styles.chipTextTapped : null,
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
    // ===== Filter mode: bordered toggle look distinct from edit chips =====
    // Edit chips fill with the group accent when active. Filter chips
    // keep a neutral background but use a colored border + check-pip
    // to communicate "this stat is enabled" at a glance, mirroring the
    // toggle-row metaphor from the mockup.
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 6,
      paddingRight: 11,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1.5,
    },
    filterChipOn: {
      borderColor: colors.primary,
      backgroundColor: 'rgba(47,125,75,0.10)',
    },
    filterChipOff: {
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
    },
    filterPip: {
      width: 16,
      height: 16,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterPipOn: {
      backgroundColor: colors.primary,
    },
    filterPipOff: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    filterPipText: {
      fontSize: 11,
      fontWeight: '900',
      lineHeight: 12,
    },
    filterPipTextOn: {
      color: '#fff',
    },
    filterPipTextOff: {
      color: colors.textMuted,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
    },
    filterChipTextOn: {
      color: colors.primaryDark,
    },
  });
}
