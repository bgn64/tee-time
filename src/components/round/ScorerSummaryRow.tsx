/**
 * ScorerSummaryRow — the shared `[avatar] [name + tee/meta line]
 * [hero score]` row used wherever a scorer needs a one-line header.
 *
 * Used by:
 *   - SummaryTabContent (one per scorer; meta line shows total tee
 *     yardage)
 *   - HolesTabContent (viewing; meta line shows per-hole context —
 *     yardage · Par · Hcp — when `holeContext` is set)
 *   - ScoreEntryAccordion (Holes scoring; same per-hole context as
 *     the viewing surface, so the surfaces look identical)
 *
 * Pulling this row into a shared component is what keeps the
 * scoring and viewing Holes surfaces visually in sync — earlier they
 * each owned their own header (`ScorerRow` and `HoleContextSummary`),
 * which drifted apart in font, score size, and tee-display style.
 *
 * Pure presentational; the parent resolves the scorer's tee + hole
 * context + computes the running/final scoreText + tone.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Tee } from '@/types/golf';

export type ScoreTone = 'over' | 'under' | 'even';

/**
 * Optional per-hole context for the meta line. When set, the row
 * renders the per-hole yardage + Par + Hcp instead of the tee's
 * total yardage. Mirrors the "ph-summary .meta" element in the
 * mockup.
 */
export type HoleContext = {
  par: number;
  handicapIndex?: number;
  /** Per-hole yardage for the scorer's tee, when known. */
  yardage?: number;
};

type Props = {
  members: readonly AvatarMember[];
  name: string;
  /** Scorer's tee (when known). When undefined the chip is omitted. */
  tee: Tee | null;
  /** Hero score text (e.g. "−3", "E", "+5"). */
  scoreText: string;
  tone: ScoreTone;
  /** Sub-label under the hero score (e.g. "THRU 11"). */
  scoreSub?: string;
  /**
   * When set, the tee display becomes tappable (with a "▾" caret) so the
   * picker stays reachable, and a dashed "+ Tee" placeholder is shown when
   * `tee` is null. Editing surfaces (live scoring + completed-round edit,
   * on the per-hole rows) wire this; read-only surfaces leave it undefined.
   */
  onPressTee?: () => void;
  /**
   * Per-hole context. When set, the meta line becomes per-hole
   * (yardage · Par X · Hcp Y). When undefined, falls back to the
   * tee's total-yardage display (Summary tab behaviour).
   *
   * May be combined with `onPressTee`: on the per-hole scoring rows
   * (where the Summary tab no longer exists) the per-hole line itself
   * becomes the tappable tee-change affordance.
   */
  holeContext?: HoleContext;
};

export function ScorerSummaryRow({
  members,
  name,
  tee,
  scoreText,
  tone,
  scoreSub,
  onPressTee,
  holeContext,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const teeLabel = tee
    ? tee.totalYardage
      ? `${tee.name} · ${tee.totalYardage.toLocaleString()}`
      : tee.name
    : null;

  let teeChip: React.ReactNode = null;
  if (holeContext && tee) {
    // Per-hole meta line. The tee name is a filled pill (matching the
    // round-config tee pill); the per-hole yds · Par · Hcp follow as
    // plain text. On editing surfaces (onPressTee set) the pill is a button
    // with a "▾" caret so the tee can be changed mid-round.
    const parts: string[] = [];
    if (holeContext.yardage != null) {
      parts.push(`${holeContext.yardage.toLocaleString()} yds`);
    }
    parts.push(`Par ${holeContext.par}`);
    if (holeContext.handicapIndex != null) {
      parts.push(`Hcp ${holeContext.handicapIndex}`);
    }
    const teeNode = onPressTee ? (
      <Pressable
        onPress={onPressTee}
        style={styles.teePill}
        accessibilityRole="button"
        accessibilityLabel={`Change tee from ${tee.name}`}>
        <Text style={styles.teePillText} numberOfLines={1}>
          {tee.name}
        </Text>
        <Text style={styles.teeChev}>▾</Text>
      </Pressable>
    ) : (
      <View style={styles.teeNameBare}>
        <Text style={styles.teeBareName} numberOfLines={1}>
          {tee.name}
        </Text>
      </View>
    );
    teeChip = (
      <View style={styles.teeBare}>
        {teeNode}
        {parts.map((p) => (
          <View key={p} style={styles.teeMetaPart}>
            <Text style={styles.teeBareSep}>·</Text>
            <Text style={styles.teeBareYds} numberOfLines={1}>
              {p}
            </Text>
          </View>
        ))}
      </View>
    );
  } else if (tee && teeLabel) {
    // Two visual styles for the total-yardage variant:
    //   - editing (onPressTee set):  pill button with chevron — looks
    //     tappable so the user discovers the picker.
    //   - read-only (no onPressTee): bare name · yardage.
    if (onPressTee) {
      teeChip = (
        <Pressable
          onPress={onPressTee}
          style={styles.teeChip}
          accessibilityRole="button"
          accessibilityLabel={`Change tee from ${tee.name}`}>
          <Text style={styles.teeLabel} numberOfLines={1}>
            {teeLabel}
          </Text>
          <Text style={styles.teeChev}>▾</Text>
        </Pressable>
      );
    } else {
      teeChip = (
        <View style={styles.teeBare}>
          <Text style={styles.teeBareName} numberOfLines={1}>
            {tee.name}
          </Text>
          {tee.totalYardage ? (
            <>
              <Text style={styles.teeBareSep}>·</Text>
              <Text style={styles.teeBareYds} numberOfLines={1}>
                {tee.totalYardage.toLocaleString()} yds
              </Text>
            </>
          ) : null}
        </View>
      );
    }
  } else if (onPressTee) {
    // Editing surface with no tee picked yet → show a dashed
    // placeholder so the user can reach the picker mid-round.
    teeChip = (
      <Pressable
        onPress={onPressTee}
        style={styles.teeChipEmpty}
        accessibilityRole="button"
        accessibilityLabel="Pick a tee">
        <Text style={styles.teePlaceholder}>+ Tee</Text>
        <Text style={styles.teeChev}>▾</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <TeamAvatarCluster
        members={members}
        size="md"
        ringColor={colors.cardBg}
      />
      <View style={styles.body}>
        <Text style={styles.handle} numberOfLines={2}>
          {joinHandles(members)}
        </Text>
        {teeChip}
      </View>
      <View style={styles.scoreCol}>
        <Text
          style={[
            styles.scoreText,
            tone === 'over' ? styles.scoreOver : null,
            tone === 'even' ? styles.scoreEven : null,
          ]}>
          {scoreText}
        </Text>
        {scoreSub ? <Text style={styles.thruText}>{scoreSub}</Text> : null}
      </View>
    </View>
  );
}

function joinHandles(members: readonly AvatarMember[]): string {
  const names = members.map((m) => m.handle ?? m.name);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    handle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    teeChip: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    teeBare: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      flexWrap: 'wrap',
    },
    teePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
    },
    teePillText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textTitle,
    },
    teeNameBare: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    teeMetaPart: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    teeBareName: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    teeBareSep: {
      fontSize: 11.5,
      color: colors.border,
    },
    teeBareYds: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    teeChipEmpty: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignSelf: 'flex-start',
    },
    teeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    teeLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.textTitle,
    },
    teePlaceholder: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    teeChev: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.textMuted,
      marginLeft: 1,
    },
    scoreCol: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    scoreText: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.primaryDark,
      lineHeight: 30,
    },
    scoreEven: {
      color: colors.textBody,
    },
    scoreOver: {
      color: colors.textTitle,
    },
    thruText: {
      marginTop: 3,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
  });
}
