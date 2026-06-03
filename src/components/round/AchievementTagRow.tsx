/**
 * AchievementTagRow — renders the "Did well" + "Hurt me" tag groups
 * with three modes:
 *
 *   - `read`  : Static pills (not pressable). Used by the read-only
 *               feed/completed Holes tab. Pills appear for every
 *               enabled tag — unset values render as plain "−" pills
 *               so the viewer sees what the scorer committed to track.
 *   - `edit`  : All `enabledTags` render. Each pill is pressable —
 *               tap cycles unset → yes → no → unset. Used by the
 *               scoring Holes tab.
 *   - `filter`: All `availableTags` render. Pressable; tap to enable /
 *               disable for the round. Different visual (dashed border
 *               for off, solid for on) so the filter mode never gets
 *               confused with a yes/no pill.
 *
 * The `whose_shots` tag is special-cased out of this row — its UI is
 * the dedicated `ShotPicker` / `ShotSequence`. We don't show a pill
 * for it because the data shape (an ordered contributor list) doesn't
 * fit the yes/no model.
 *
 * Layout: a small vertical stack of two tag groups; each group has a
 * tiny label ("DID WELL" / "HURT ME") and a horizontal wrap of pills.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ACHIEVEMENT_TAGS,
  type AchievementTag,
  type TagGroup,
  type TagKey,
  type TagValue,
  type TagValueMap,
  cycleTagValue,
  valueTone,
} from '@/library/golf/achievementTags';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Mode = 'read' | 'edit' | 'filter';

type Props = {
  mode: Mode;
  /**
   * `read` / `edit`: the (scorer, hole) values map. Pills look up
   * their value via `values[tag.key]`; absent = unset.
   * `filter`: ignored — pass `{}`.
   */
  values: TagValueMap;
  /**
   * Subset of `ACHIEVEMENT_TAGS` to render. In `edit` and `read`
   * mode this is the per-scorer enabled set (defaults from
   * `defaultEnabledTagsFor` unless override). In `filter` mode this
   * is the full available set (everything not scramble-only on
   * stroke rounds; everything on scramble) and represents the
   * currently-enabled subset (for the "on" visual).
   */
  enabledTags: readonly TagKey[];
  /**
   * Required for `edit` mode — called when the user taps a pill.
   * The new value is the result of cycling the current value.
   */
  onSetValue?: (tagKey: TagKey, value: TagValue | undefined) => void;
  /** Required for `filter` mode — toggles the tag in/out of enabledTags. */
  onToggleEnabled?: (tagKey: TagKey) => void;
  /** True for scramble rounds — controls whether scramble-only tags appear in filter mode. */
  isScramble?: boolean;
};

const GROUP_LABEL: Record<TagGroup, string> = {
  did_well: 'Did well',
  hurt_me: 'Hurt me',
  scramble_only: 'Scramble',
};

export function AchievementTagRow({
  mode,
  values,
  enabledTags,
  onSetValue,
  onToggleEnabled,
  isScramble = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Build per-group render lists. `whose_shots` is always excluded —
  // it has its own dedicated UI (ShotPicker / ShotSequence) and the
  // yes/no model doesn't fit.
  const groups = useMemo<
    { group: TagGroup; label: string; tagsToRender: AchievementTag[] }[]
  >(() => {
    const enabledSet = new Set(enabledTags);
    const filter = (g: TagGroup): AchievementTag[] => {
      const list: AchievementTag[] = [];
      for (const t of ACHIEVEMENT_TAGS) {
        if (t.group !== g) continue;
        if (t.key === 'whose_shots') continue;
        if (t.scrambleOnly && !isScramble) continue;
        if (mode !== 'filter' && !enabledSet.has(t.key)) continue;
        list.push(t);
      }
      return list;
    };

    const out: { group: TagGroup; label: string; tagsToRender: AchievementTag[] }[] = [];
    out.push({ group: 'did_well', label: GROUP_LABEL.did_well, tagsToRender: filter('did_well') });
    out.push({ group: 'hurt_me',  label: GROUP_LABEL.hurt_me,  tagsToRender: filter('hurt_me')  });
    return out;
  }, [mode, enabledTags, isScramble]);

  // Nothing to render — read/edit with no enabled tags, or filter
  // with no available tags. Parent decides whether to show empty state.
  if (groups.every((g) => g.tagsToRender.length === 0)) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {groups.map((g) => {
        if (g.tagsToRender.length === 0) return null;
        return (
          <View key={g.group} style={styles.group}>
            <Text style={styles.groupLabel}>{g.label.toUpperCase()}</Text>
            <View style={styles.cluster}>
              {g.tagsToRender.map((tag) => {
                if (mode === 'filter') {
                  const isOn = enabledTags.includes(tag.key);
                  return (
                    <FilterPill
                      key={tag.key}
                      label={tag.label}
                      isOn={isOn}
                      onPress={() => onToggleEnabled?.(tag.key)}
                      styles={styles}
                      colors={colors}
                    />
                  );
                }
                const v = values[tag.key];
                const tone = v ? valueTone(g.group, v) : null;
                const onPress =
                  mode === 'edit' && onSetValue
                    ? () => onSetValue(tag.key, cycleTagValue(v))
                    : undefined;
                return (
                  <StatPill
                    key={tag.key}
                    label={tag.label}
                    value={v}
                    tone={tone}
                    onPress={onPress}
                    styles={styles}
                    colors={colors}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

type Tone = 'good' | 'bad';

type StatPillProps = {
  label: string;
  value: TagValue | undefined;
  tone: Tone | null;
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
};

function StatPill({ label, value, tone, onPress, styles, colors: _colors }: StatPillProps) {
  const inner = (
    <>
      <View
        style={[
          styles.pillIcon,
          tone === 'good' ? styles.pillIconGood : null,
          tone === 'bad' ? styles.pillIconBad : null,
        ]}>
        <Text
          style={[
            styles.pillIconText,
            tone ? styles.pillIconTextOn : null,
          ]}>
          {value === 'yes' ? '✓' : value === 'no' ? '✗' : '−'}
        </Text>
      </View>
      <Text
        style={[
          styles.pillLabel,
          tone === 'good' ? styles.pillLabelGood : null,
          tone === 'bad' ? styles.pillLabelBad : null,
        ]}>
        {label}
      </Text>
    </>
  );
  const containerStyle = [
    styles.pill,
    tone === 'good' ? styles.pillGood : null,
    tone === 'bad' ? styles.pillBad : null,
  ];
  if (!onPress) {
    return <View style={containerStyle}>{inner}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={containerStyle}
      accessibilityRole="button"
      accessibilityLabel={
        value
          ? `${label}: ${value === 'yes' ? 'yes' : 'no'} — tap to change`
          : `${label}: unset — tap to mark yes`
      }
      accessibilityState={{ selected: value !== undefined }}>
      {inner}
    </Pressable>
  );
}

type FilterPillProps = {
  label: string;
  isOn: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
};

function FilterPill({ label, isOn, onPress, styles, colors: _colors }: FilterPillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterPill, isOn ? styles.filterPillOn : styles.filterPillOff]}
      accessibilityRole="button"
      accessibilityState={{ selected: isOn }}
      accessibilityLabel={`${label} ${isOn ? 'enabled' : 'disabled'} — tap to toggle`}>
      <Text style={[styles.filterPillLabel, isOn ? styles.filterPillLabelOn : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  // Outcome palette — green for "good outcome", red for "bad outcome".
  // These are visual constants so the pills don't depend on the
  // active brand colour drifting.
  const goodHex = colors.primary;
  const badHex = colors.accent;
  const goodTint = 'rgba(47,125,75,0.10)';
  const badTint = 'rgba(217,72,53,0.10)';
  const goodDark = colors.primaryDark;
  return StyleSheet.create({
    wrap: {
      flexDirection: 'column',
      gap: 10,
    },
    group: {
      gap: 6,
    },
    groupLabel: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    cluster: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    // ===== StatPill (cycling 3-state) =====
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 6,
      paddingRight: 11,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
    },
    pillGood: {
      borderColor: goodHex,
      backgroundColor: goodTint,
    },
    pillBad: {
      borderColor: badHex,
      backgroundColor: badTint,
    },
    pillIcon: {
      width: 18,
      height: 18,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    pillIconGood: {
      backgroundColor: goodHex,
      borderColor: goodHex,
    },
    pillIconBad: {
      backgroundColor: badHex,
      borderColor: badHex,
    },
    pillIconText: {
      fontSize: 10,
      lineHeight: 11,
      fontWeight: '900',
      color: colors.textMuted,
    },
    pillIconTextOn: {
      color: '#fff',
    },
    pillLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
    pillLabelGood: {
      color: goodDark,
    },
    pillLabelBad: {
      color: badHex,
    },

    // ===== FilterPill (enable / disable a stat for the round) =====
    // Visually distinct from the yes/no/unset cycling pill so the
    // user can tell "enabled / disabled for tracking" apart from "yes /
    // no / unset for this hole". Filter chips are solid-filled when
    // ON (no circular pip), dashed when OFF. They use a neutral dark
    // palette rather than the outcome green/red so they don't read
    // like a positive/negative outcome.
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1.5,
    },
    filterPillOn: {
      borderColor: colors.textTitle,
      backgroundColor: colors.textTitle,
    },
    filterPillOff: {
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
    },
    filterPillLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
    },
    filterPillLabelOn: {
      color: '#fff',
    },
  });
}
