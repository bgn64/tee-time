/**
 * Live scoring screen — root of the Score tab once a round is active.
 *
 * Unified scoring/editing layout (v9):
 *   - HoleNavBar at top (prev/next chevrons + current hole + par/yardage)
 *   - One ScoreEntryRow per scorer (avatar · name · running-score chip ·
 *     −  score-display  +)
 *   - ReadOnlyScorecard below (current hole highlighted, tap any cell to
 *     jump to that hole). The final-totals box renders live alongside
 *     the in-progress grid so the running result is always visible.
 *   - Header right slot: "Finish" action chip.
 *   - Below the grid: an "Abandon round" danger button.
 *
 * For scramble rounds the entry rows are per-team (team avatar/name +
 * team running score). The grid uses team rows.
 *
 * Hardware back is still intercepted on Android so the locked round
 * can't be exited via gesture — round exits go through Finish or
 * Abandon.
 */

import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConfirmAbandonSheet } from '@/components/ConfirmAbandonSheet';
import { HoleNavBar } from '@/components/HoleNavBar';
import { RangeDropdown, rangeLabel } from '@/components/RangeDropdown';
import { RangefinderSheet } from '@/components/RangefinderSheet';
import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { ScoreEntryRow } from '@/components/ScoreEntryRow';
import type { AvatarMember } from '@/components/TeamAvatarCluster';
import { confirm } from '@/lib/dialog';
import { formatScore, holesInRange } from '@/lib/scoring';
import { buildTeamMembers } from '@/lib/scorerMembers';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

type Scorer = {
  id: string;
  name: string;
  color: string;
  members: AvatarMember[];
};

export default function ScoringScreen() {
  const { colors } = useTheme();
  const {
    currentRound,
    setCustomHoleScore,
    setCurrentHole,
    setHoleRange,
    completeCurrentRound,
    abandonCurrentRound,
  } = useGolfRound();
  const { getPlayer, allPlayers } = usePlayers();
  const { account } = useAccount();
  const { profileCache } = useSocial();

  const [abandonConfirmVisible, setAbandonConfirmVisible] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [rangefinderOpen, setRangefinderOpen] = useState(false);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isScramble =
    currentRound?.scoringRule === 'scramble' && (currentRound.teams?.length ?? 0) > 0;

  const handleFinish = useCallback(async () => {
    if (!currentRound) return;
    const inRange = holesInRange(currentRound.course.holes, currentRound.holeRange);
    const requiredIds = isScramble
      ? currentRound.teams!.map((t) => t.id)
      : currentRound.playerIds;
    const fullyScored = inRange.every((h) =>
      requiredIds.every((sid) =>
        currentRound.scores.some(
          (s) => s.scorerId === sid && s.holeNumber === h.number
        )
      )
    );
    if (!fullyScored) {
      const ok = await confirm({
        title: 'Finish with missing scores?',
        message: `Not every hole has a score yet (${inRange.length} total). You can finish anyway and edit later from the Rounds tab.`,
        confirmLabel: 'Finish anyway',
      });
      if (!ok) return;
    }
    completeCurrentRound();
    router.replace('/(tabs)/(score)');
  }, [currentRound, isScramble, completeCurrentRound]);

  // `useScreenHeader` only re-registers the slot when its semantic key
  // (label / kind / active) changes — not when the captured `onPress`
  // closure changes identity. Stash `handleFinish` in a ref so the
  // stored slot always invokes the latest callback (with the freshest
  // `currentRound`) and not a stale closure from an earlier render.
  const handleFinishRef = useRef(handleFinish);
  handleFinishRef.current = handleFinish;

  useScreenHeader({
    left: { kind: 'text', text: 'SCORE' },
    right: {
      kind: 'action',
      label: 'Finish',
      onPress: () => handleFinishRef.current(),
    },
  });

  // Block Android hardware back while the locked round is on screen.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (rangefinderOpen) {
          setRangefinderOpen(false);
        }
        return true;
      });
      return () => sub.remove();
    }, [rangefinderOpen])
  );

  // Defensive bounce if the round disappears.
  useEffect(() => {
    if (!currentRound) {
      router.replace('/(tabs)/(score)');
    }
  }, [currentRound]);

  if (!currentRound) return null;

  const currentHole = currentRound.course.holes.find(
    (h) => h.number === currentRound.currentHoleNumber
  );
  if (!currentHole) return null;

  const maxHole = currentRound.course.holes.length;
  const courseLocation =
    Number.isFinite(currentRound.course.latitude) &&
    Number.isFinite(currentRound.course.longitude)
      ? {
          latitude: currentRound.course.latitude!,
          longitude: currentRound.course.longitude!,
        }
      : null;

  const scorers: Scorer[] = isScramble
    ? currentRound.teams!.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        members: buildTeamMembers(currentRound, t.id, {
          account,
          profileCache,
          allPlayers,
          fallbackColor: colors.primary,
        }),
      }))
    : currentRound.playerIds
        .map((pid) => {
          const p = getPlayer(pid);
          if (!p) return null;
          const color = p.color || colors.primary;
          return {
            id: p.id,
            name: p.nickname,
            color,
            members: [{ id: p.id, name: p.nickname, color }],
          };
        })
        .filter((s): s is Scorer => s !== null);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleBlock}>
          <View style={styles.pillRow}>
            <View style={styles.formatPill}>
              <Text style={styles.formatPillText}>
                {isScramble ? 'SCRAMBLE' : 'STROKE'}
              </Text>
            </View>
            {currentRound.course.holes.length >= 18 && (
              <Pressable
                style={[
                  styles.rangePill,
                  rangeMenuOpen && styles.rangePillActive,
                ]}
                onPress={() => setRangeMenuOpen(true)}
                hitSlop={4}>
                <Text
                  style={[
                    styles.rangePillText,
                    rangeMenuOpen && styles.rangePillTextActive,
                  ]}>
                  {rangeLabel(currentRound.holeRange)}
                </Text>
                <Text
                  style={[
                    styles.rangePillChev,
                    rangeMenuOpen && styles.rangePillChevActive,
                  ]}>
                  {rangeMenuOpen ? '▴' : '▾'}
                </Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {currentRound.course.name}
          </Text>
        </View>

        <HoleNavBar
          holeNumber={currentHole.number}
          par={currentHole.par}
          yardage={currentHole.yardage}
          maxHole={maxHole}
          onChange={setCurrentHole}
        />

        <Pressable
          style={styles.rangefinderBtn}
          onPress={() => setRangefinderOpen(true)}>
          <View>
            <Text style={styles.rangefinderLabel}>GPS RANGEFINDER</Text>
            <Text style={styles.rangefinderText}>Satellite yardage to any target</Text>
          </View>
          <Text style={styles.rangefinderIcon}>⌖</Text>
        </Pressable>

        <View style={styles.entryCard}>
          {scorers.map((s, i) => {
            const score = currentRound.scores.find(
              (sc) => sc.scorerId === s.id && sc.holeNumber === currentHole.number
            );
            const totals = computeRunning(currentRound, s.id);
            const runningValue =
              totals.holes === 0
                ? 'E'
                : formatScore(totals.rel);
            const tone: 'over' | 'under' | 'even' =
              totals.holes === 0
                ? 'even'
                : totals.rel > 0
                ? 'over'
                : totals.rel < 0
                ? 'under'
                : 'even';
            return (
              <View key={s.id} style={i > 0 ? styles.entryRowSep : undefined}>
                <ScoreEntryRow
                  members={s.members}
                  name={isScramble ? undefined : s.name}
                  runningText={`${runningValue} · thru ${totals.holes}`}
                  runningTone={tone}
                  holeNumber={currentHole.number}
                  par={currentHole.par}
                  strokes={score ? score.strokes : null}
                  onChange={(strokes) =>
                    setCustomHoleScore(s.id, currentHole.number, strokes)
                  }
                />
              </View>
            );
          })}
        </View>

        <Text style={styles.gridHint}>Tap any hole to jump</Text>
        <ReadOnlyScorecard
          round={currentRound}
          currentHoleNumber={currentHole.number}
          onHolePress={setCurrentHole}
        />

        <Pressable
          style={styles.abandonBtn}
          onPress={() => setAbandonConfirmVisible(true)}>
          <Text style={styles.abandonBtnText}>Abandon round</Text>
        </Pressable>
      </ScrollView>

      <ConfirmAbandonSheet
        visible={abandonConfirmVisible}
        onCancel={() => setAbandonConfirmVisible(false)}
        onConfirm={() => {
          setAbandonConfirmVisible(false);
          setTimeout(() => {
            abandonCurrentRound();
            router.replace('/(tabs)/(score)');
          }, 0);
        }}
      />

      <RangefinderSheet
        visible={rangefinderOpen}
        courseName={currentRound.course.name}
        holeNumber={currentHole.number}
        par={currentHole.par}
        yardage={currentHole.yardage}
        courseLocation={courseLocation}
        onClose={() => setRangefinderOpen(false)}
      />

      <RangeDropdown
        visible={rangeMenuOpen}
        current={currentRound.holeRange}
        onCancel={() => setRangeMenuOpen(false)}
        onPick={(next) => {
          setRangeMenuOpen(false);
          setHoleRange(next);
        }}
      />
    </View>
  );
}

function computeRunning(
  round: NonNullable<ReturnType<typeof useGolfRound>['currentRound']>,
  scorerId: string
): { rel: number; holes: number } {
  let rel = 0;
  let holes = 0;
  for (const s of round.scores) {
    if (s.scorerId !== scorerId) continue;
    const hole = round.course.holes.find((h) => h.number === s.holeNumber);
    if (!hole) continue;
    rel += s.strokes - hole.par;
    holes++;
  }
  return { rel, holes };
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 14,
      paddingBottom: 32,
    },
    titleBlock: {
      marginBottom: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    pillRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      marginBottom: 4,
    },
    formatPill: {
      backgroundColor: colors.chipBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    formatPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: colors.primaryDark,
    },
    rangePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.chipBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    rangePillActive: {
      backgroundColor: colors.primary,
    },
    rangePillText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.primaryDark,
    },
    rangePillTextActive: { color: '#fff' },
    rangePillChev: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: '800',
    },
    rangePillChevActive: { color: '#fff' },
    entryCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 12,
    },
    rangefinderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 13,
      paddingVertical: 11,
      marginBottom: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(124, 179, 66, 0.28)',
      backgroundColor: colors.chipBg,
    },
    rangefinderLabel: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.7,
      color: colors.primaryDark,
    },
    rangefinderText: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    rangefinderIcon: {
      fontSize: 24,
      lineHeight: 26,
      fontWeight: '900',
      color: colors.primaryDark,
    },
    entryRowSep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 3,
      paddingTop: 3,
    },
    gridHint: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
      marginBottom: 6,
      marginLeft: 4,
    },
    abandonBtn: {
      marginTop: 18,
      borderWidth: 1,
      borderColor: '#f5cccc',
      borderRadius: 11,
      paddingVertical: 11,
      alignItems: 'center',
    },
    abandonBtnText: {
      color: '#d54848',
      fontWeight: '800',
      fontSize: 12,
    },
  });
}
