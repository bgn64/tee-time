/**
 * Score-entry row — one per scorer (player in stroke, team in scramble).
 *
 * Layout: avatar-cluster · optional name · optional running-score chip · quick-pick chip row
 *
 * The avatar is always a `<TeamAvatarCluster>` (one circle for stroke, N
 * circles for scramble teams). The `name` line is optional: stroke rows
 * pass the player's display name, scramble rows omit it entirely — the
 * cluster IS the identification, an arbitrary team name (e.g. "Bob &
 * Alice") plus a single-letter initial added nothing.
 *
 * The chip row is a five-tile pad showing relative-to-par values
 * (−2 / −1 / E / +1 / +2). Tapping a chip sets the score. A sixth `✕`
 * chip opens the `CustomScoreSheet` for arbitrary values (e.g. +3, +4,
 * or a double-eagle −3). Once a score outside −2…+2 is set, that chip
 * displays the actual value (e.g. `+4`, `−3`) with the appropriate
 * active tone, and tapping it re-opens the sheet to adjust.
 *
 * When neither `runningText` nor `subtext` is provided the name renders
 * at a larger weight/size because there's no second line of text below.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CustomScoreSheet } from '@/components/CustomScoreSheet';
import { TeamAvatarCluster, type AvatarMember } from '@/components/TeamAvatarCluster';
import { formatScore } from '@/lib/scoring';
import { type NameSegment, flattenSegments } from '@/lib/scorerNames';
import { useTheme } from '@/state/ThemeContext';

type RunningTone = 'over' | 'under' | 'even';

type Props = {
  /** Avatar cluster contents. One entry for stroke, N for scramble teams. */
  members: ReadonlyArray<AvatarMember>;
  /**
   * Display name shown next to the cluster. Omit in scramble — the cluster
   * itself identifies the team and an arbitrary team name adds noise.
   * Ignored when `nameSegments` is provided.
   */
  name?: string;
  /**
   * Rich rendering of the name line. Linked segments render bold + in
   * the segment's color and call `onPressLinkedName` on tap. Plain
   * separator segments stay default-styled. When set, this overrides
   * `name`; the `flattenSegments(nameSegments)` value is used as the
   * fallback heading for `CustomScoreSheet`.
   */
  nameSegments?: ReadonlyArray<NameSegment>;
  /** Tap handler for linked segments. Routing stays at the caller. */
  onPressLinkedName?: (targetId: string) => void;
  /** When provided, rendered as a small chip under the name. Live scoring uses this. */
  runningText?: string;
  /** Tone of the running-score chip's value portion. */
  runningTone?: RunningTone;
  /** Alternative subtext for non-scoring contexts. Omit in edit mode. */
  subtext?: string;
  /** Hole number — passed through to the custom-score sheet for context. */
  holeNumber: number;
  par: number;
  strokes: number | null;
  onChange: (strokes: number) => void;
};

const QUICK_PICKS: ReadonlyArray<{ rel: number; label: string }> = [
  { rel: -2, label: '−2' },
  { rel: -1, label: '−1' },
  { rel: 0, label: 'E' },
  { rel: 1, label: '+1' },
  { rel: 2, label: '+2' },
];

export function ScoreEntryRow({
  members,
  name,
  nameSegments,
  onPressLinkedName,
  runningText,
  runningTone,
  subtext,
  holeNumber,
  par,
  strokes,
  onChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sheetOpen, setSheetOpen] = useState(false);

  const rel = strokes === null ? null : strokes - par;
  const customActive = rel !== null && (rel > 2 || rel < -2);

  const handleQuickPick = (relVal: number) => {
    onChange(Math.max(1, par + relVal));
  };

  // The plain string variant of the name is still used in two places:
  //   · the CustomScoreSheet heading (no rich rendering there)
  //   · the legacy `hasInfo` / fallback path when `nameSegments` is
  //     not provided
  const flatName = nameSegments ? flattenSegments(nameSegments) : name;

  const hasSegments = !!nameSegments && nameSegments.length > 0;
  const hasSecondLine = !!(runningText || subtext);
  const hasInfo = hasSegments || !!name || hasSecondLine;
  // `CustomScoreSheet` always wants a heading; for scramble (no `name`
  // and no segments) we synthesize one from the member names so the
  // modal isn't anonymous.
  const sheetHeading =
    flatName ?? members.map((m) => m.name).filter(Boolean).join(' & ');

  const nameTextStyle = hasSecondLine ? styles.name : styles.nameLarge;
  const nameNode = hasSegments ? (
    <Text style={nameTextStyle} numberOfLines={1}>
      {nameSegments!.map((seg, i) => {
        const tappable = seg.linked && seg.linkTargetId && onPressLinkedName;
        if (tappable) {
          return (
            <Text
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              onPress={() => onPressLinkedName!(seg.linkTargetId!)}
              suppressHighlighting
              style={styles.nameLinked}>
              {seg.text}
            </Text>
          );
        }
        // eslint-disable-next-line react/no-array-index-key
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  ) : name ? (
    <Text style={nameTextStyle} numberOfLines={1}>
      {name}
    </Text>
  ) : null;

  return (
    <View style={styles.row}>
      <View style={styles.who}>
        <TeamAvatarCluster
          members={members}
          size="md"
          ringColor={colors.cardBg}
        />
        {hasInfo ? (
          <View style={styles.whoInfo}>
            {nameNode}
            {runningText ? (
              <Text style={styles.running} numberOfLines={1}>
                <Text style={runningTone ? styles[`tone_${runningTone}`] : undefined}>
                  {runningText.split(' · ')[0]}
                </Text>
                {runningText.includes(' · ') ? (
                  <Text style={styles.runningRest}> · {runningText.split(' · ').slice(1).join(' · ')}</Text>
                ) : null}
              </Text>
            ) : subtext ? (
              <Text style={styles.subtext} numberOfLines={1}>
                {subtext}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        {QUICK_PICKS.map((q) => {
          const isActive = rel === q.rel;
          return (
            <Pressable
              key={q.rel}
              onPress={() => handleQuickPick(q.rel)}
              style={[
                styles.chip,
                isActive && (q.rel > 0 ? styles.chipActiveOver : styles.chipActive),
              ]}
              hitSlop={2}>
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {q.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={[
            styles.chip,
            customActive &&
              (rel! > 0 ? styles.chipActiveOver : styles.chipActive),
          ]}
          hitSlop={2}>
          <Text style={[styles.chipText, customActive && styles.chipTextActive]}>
            {customActive ? formatScore(rel!) : '✕'}
          </Text>
        </Pressable>
      </View>

      <CustomScoreSheet
        visible={sheetOpen}
        scorerName={sheetHeading}
        holeNumber={holeNumber}
        par={par}
        initialStrokes={strokes}
        onCancel={() => setSheetOpen(false)}
        onConfirm={(v) => {
          setSheetOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    who: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
      maxWidth: '32%',
    },
    whoInfo: { flex: 1, minWidth: 0 },
    name: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    nameLarge: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textTitle,
    },
    nameLinked: {
      fontWeight: '900',
    },
    running: {
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.3,
      color: colors.textMuted,
      marginTop: 1,
    },
    runningRest: { fontWeight: '600' },
    subtext: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 1,
    },
    tone_over: { color: colors.accent, fontWeight: '800' },
    tone_under: { color: colors.primaryDark, fontWeight: '800' },
    tone_even: { color: colors.primaryDark, fontWeight: '800' },
    controls: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
    },
    chip: {
      flexBasis: 0,
      flexGrow: 1,
      minWidth: 0,
      maxWidth: 42,
      height: 38,
      borderRadius: 9,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      backgroundColor: colors.primary,
    },
    chipActiveOver: {
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
