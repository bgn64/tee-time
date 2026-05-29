/**
 * Format Selection — Step 2 of the Score-tab round-setup flow.
 *
 * Trimmed version of the destination `format.tsx`: stroke + scramble,
 * no live-share toggle. Reads `courseId` + comma-separated `playerIds`
 * from the URL, lets the user pick a tee per player (stroke) or
 * configure teams + per-team tees (scramble), then calls
 * `startRound(...)`.
 *
 * Post-start navigation: after `startRound` resolves, the handler
 * uses `navigation.reset` to atomically rebuild the stack as
 * `[hub, scoring]` so back behavior on the scoring screen is
 * identical to the path you'd take via the hub's "Continue" card
 * (back arrow naturally pops to hub; no manual `headerLeft`
 * override required on scoring).
 *
 * Redirect gate: bounces to `/scoring` if a round is already in
 * flight when this screen mounts — covers deep links + stale pushes
 * so a second round can't be kicked off in parallel.
 *
 * Scramble state ownership: groups/teamIds/teeIdByTeam live here (not
 * in `<ScrambleBody />`) so toggling stroke ↔ scramble preserves the
 * user's team work. Derivations (`teams`, `teeIdByParticipant`,
 * `canStart`) are recomputed from that state, so `handleStart` reads
 * the same shape regardless of where the user toggled last.
 */

import { Redirect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScrambleBody } from '@/components/scoring/ScrambleBody';
import { TeePickerSheet, teeSwatch } from '@/components/scoring/TeePickerSheet';
import { defaultTeeIdForCourse } from '@/library/golf/courseHelpers';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useRound } from '@/library/golf/RoundContext';
import { buildInitialScrambleState, buildTeamsFromGroups } from '@/library/golf/teams';
import { useCourse } from '@/library/golf/useCourses';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ScoringRule, Tee, Team } from '@/types/golf';

const NEW_TEAM_PLACEHOLDER = 'New team';

export default function FormatScreen() {
  const { colors } = useTheme();
  const { courseId, playerIds: rawPlayerIds } = useLocalSearchParams<{
    courseId?: string;
    playerIds?: string;
  }>();
  const { currentRound, roundHydrated, startRound, userId } = useRound();
  const navigation = useNavigation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const playerIds = useMemo<string[]>(
    () => (rawPlayerIds ? rawPlayerIds.split(',').filter(Boolean) : []),
    [rawPlayerIds]
  );

  const { course, loading: courseLoading, enriching: courseEnriching, error: courseError } = useCourse(courseId);

  const [scoringRule, setScoringRule] = useState<ScoringRule>('stroke');
  const [teeIds, setTeeIds] = useState<Record<string, string | undefined>>(
    () => {
      const defaultTee = course ? defaultTeeIdForCourse(course) : undefined;
      const seeded: Record<string, string | undefined> = {};
      for (const pid of playerIds) seeded[pid] = defaultTee;
      return seeded;
    }
  );
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Scramble team-config state — hoisted here from ScrambleBody so
  // toggling stroke ↔ scramble doesn't discard the user's work.
  // Seeded once via the same helper that previously lived inside
  // ScrambleBody. Re-mount on `rawPlayerIds` change is handled by
  // expo-router (the URL is the route key), so we don't need a manual
  // reset effect here.
  const [scrambleInit] = useState(() =>
    buildInitialScrambleState(
      playerIds,
      course ? defaultTeeIdForCourse(course) : undefined
    )
  );
  const [scrambleGroups, setScrambleGroups] = useState<string[][]>(scrambleInit.groups);
  const [scrambleTeamIds, setScrambleTeamIds] = useState<string[]>(scrambleInit.teamIds);
  const [scrambleTeeIdByTeam, setScrambleTeeIdByTeam] = useState<
    Record<string, string | undefined>
  >(scrambleInit.teeIdByTeam);

  // Resolve display info for each participant via the resolver
  // (PowerSync watches over profiles + custom_players). Called
  // unconditionally so the hook order is stable.
  const resolver = useParticipantResolver(playerIds);

  // Inputs to the scramble derivations below. Computed before the
  // early returns so the `useMemo`s downstream stay in the same hook
  // position on every render. `defaultTeeId` is undefined when the
  // course isn't loaded yet — the derivations all handle that
  // gracefully because the only render path that actually consumes
  // them is gated on `course` further down.
  const selfParticipantKey = userId ? userParticipantKey(userId) : undefined;
  const defaultTeeId = course ? defaultTeeIdForCourse(course) : undefined;
  const selfFirstName = (() => {
    if (!selfParticipantKey) return undefined;
    const name = resolver.get(selfParticipantKey)?.displayName?.trim();
    if (!name) return undefined;
    return name.split(/\s+/)[0];
  })();

  // Derive scramble teams + per-participant tees from the hoisted
  // state. Re-derived on every render — name/color follow the live
  // resolver, but the `id` field is held stable through
  // `scrambleTeamIds` so React keys + score writes stay coherent.
  const scrambleTeams: Team[] = useMemo(() => {
    return buildTeamsFromGroups(
      scrambleGroups,
      (id) => {
        const r = resolver.get(id);
        return r ? { displayName: r.displayName, avatarColor: r.avatarColor } : undefined;
      },
      selfParticipantKey ?? null,
      scrambleTeamIds,
      selfFirstName
    ).map((t, i) => {
      // Pending empty bucket gets a friendly placeholder name.
      if (scrambleGroups[i].length === 0) {
        return { ...t, name: NEW_TEAM_PLACEHOLDER };
      }
      return t;
    });
  }, [scrambleGroups, scrambleTeamIds, resolver, selfParticipantKey, selfFirstName]);

  const scrambleTeeIdByParticipant: Record<string, string | undefined> = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const team of scrambleTeams) {
      const teeId = scrambleTeeIdByTeam[team.id] ?? defaultTeeId;
      for (const pid of team.playerIds) out[pid] = teeId;
    }
    return out;
  }, [scrambleTeams, scrambleTeeIdByTeam, defaultTeeId]);

  const scrambleCanStart =
    scrambleTeams.length > 0 && scrambleTeams.every((t) => t.playerIds.length > 0);

  if (!roundHydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (currentRound) {
    return <Redirect href="/(tabs)/(score)/scoring" />;
  }

  // Distinguish "still loading the course" from "course truly missing".
  // While the REST fetch or the lazy enrichment is in flight we show a
  // spinner with helper text; only after both resolve do we treat a
  // null `course` as a hard error.
  if (courseLoading || courseEnriching) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.errorText, { color: colors.textMuted, marginTop: 8 }]}>
          {courseEnriching ? 'Loading scorecard…' : 'Loading course…'}
        </Text>
      </View>
    );
  }

  if (!course || playerIds.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textBody }]}>
          {courseError ?? 'Missing course or players. Go back and try again.'}
        </Text>
      </View>
    );
  }

  const courseTees: Tee[] = course.tees ?? [];
  const hasTees = courseTees.length > 0;
  const teeById = new Map(courseTees.map((t) => [t.id, t]));

  function resolveName(playerId: string): string {
    return resolver.get(playerId)?.displayName || 'Player';
  }

  function resolveColor(playerId: string): string {
    return resolver.get(playerId)?.avatarColor || colors.primary;
  }

  async function handleStart() {
    if (starting) return;
    if (!course || playerIds.length === 0) return;
    setStarting(true);
    setStartError(null);
    try {
      if (scoringRule === 'scramble') {
        if (!scrambleCanStart || scrambleTeams.length === 0) {
          throw new Error('Every team needs at least one player.');
        }
        await startRound({
          course,
          playerIds: scrambleTeams.flatMap((t) => t.playerIds),
          holeRange: 'all',
          teeIds: scrambleTeeIdByParticipant,
          scoringRule: 'scramble',
          teams: scrambleTeams,
        });
      } else {
        await startRound({
          course,
          playerIds,
          holeRange: 'all',
          teeIds,
        });
      }
      // Atomically rebuild the Rounds-tab stack as [hub, scoring].
      // Without this, the leftover new-round-flow screens (new,
      // players, format) would sit beneath scoring; the natural
      // back arrow on scoring would land on `players`, which has a
      // redirect-when-currentRound gate that would bounce the user
      // straight back to scoring. After reset, scoring's natural
      // back arrow simply pops to the hub like it does after a
      // Continue from the hub.
      //
      // Race note: there's a brief window between this write
      // resolving and RoundProvider's useQuery subscription firing
      // to surface the new currentRound. Scoring's bounce effect
      // tolerates that window via a 120ms mount-grace; see the
      // useEffect block in scoring.tsx for the rationale.
      navigation.reset({
        index: 1,
        routes: [
          { name: 'index' as never },
          { name: 'scoring' as never },
        ],
      });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  const startDisabled =
    starting || (scoringRule === 'scramble' && !scrambleCanStart);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting} numberOfLines={1}>
          {course.name} ·{' '}
          {playerIds.length === 1 ? 'solo' : `${playerIds.length} players`}
        </Text>
        <Text style={styles.title}>How are you scoring?</Text>

        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setScoringRule('stroke')}
            style={[
              styles.toggle,
              scoringRule === 'stroke' && styles.toggleActive,
            ]}>
            <Text
              style={[
                styles.toggleText,
                scoringRule === 'stroke' && styles.toggleTextActive,
              ]}>
              Stroke
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setScoringRule('scramble')}
            disabled={playerIds.length < 2}
            style={[
              styles.toggle,
              scoringRule === 'scramble' && styles.toggleActive,
              playerIds.length < 2 && styles.toggleDisabled,
            ]}>
            <Text
              style={[
                styles.toggleText,
                scoringRule === 'scramble' && styles.toggleTextActive,
                playerIds.length < 2 && styles.toggleTextDisabled,
              ]}>
              Scramble
            </Text>
          </Pressable>
        </View>

        <View style={styles.help}>
          {scoringRule === 'stroke' ? (
            <>
              <Text style={styles.helpHead}>Stroke play.</Text>
              <Text style={styles.helpBody}>
                Everyone scores for themselves. Lowest total wins.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.helpHead}>Scramble.</Text>
              <Text style={styles.helpBody}>
                Pick teams. Each team plays one ball per hole and shares the same tees.
              </Text>
            </>
          )}
        </View>

        {scoringRule === 'stroke' ? (
          <View style={styles.list}>
            {playerIds.map((id) => {
              const color = resolveColor(id);
              const letter = (resolveName(id)[0] ?? '?').toUpperCase();
              const tee = teeIds[id] ? teeById.get(teeIds[id]!) : undefined;
              return (
                <View key={id} style={styles.rowCard}>
                  <View style={[styles.rowAvatar, { backgroundColor: color }]}>
                    <Text style={styles.rowAvatarText}>{letter}</Text>
                  </View>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {resolveName(id)}
                  </Text>
                  {hasTees && (
                    <Pressable
                      style={[styles.teePill, !tee && styles.teePillEmpty]}
                      onPress={() => setPickerTarget(id)}>
                      {tee ? (
                        <>
                          <View
                            style={[
                              styles.teePillDot,
                              { backgroundColor: teeSwatch(tee) },
                            ]}
                          />
                          <Text style={styles.teePillText} numberOfLines={1}>
                            {tee.name}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.teePillTextEmpty}>+ Tee</Text>
                      )}
                      <Text style={styles.teePillChev}>▾</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <ScrambleBody
            playerIds={playerIds}
            resolver={resolver}
            selfParticipantKey={selfParticipantKey}
            firstNameForSelf={selfFirstName}
            courseTees={courseTees}
            defaultTeeId={defaultTeeId}
            groups={scrambleGroups}
            setGroups={setScrambleGroups}
            teamIds={scrambleTeamIds}
            setTeamIds={setScrambleTeamIds}
            teeIdByTeam={scrambleTeeIdByTeam}
            setTeeIdByTeam={setScrambleTeeIdByTeam}
          />
        )}

        {startError && (
          <Text style={[styles.errorText, { color: colors.accent, marginTop: 12 }]}>
            {startError}
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.nextBtn, startDisabled && styles.nextBtnDisabled]}
          disabled={startDisabled}
          onPress={handleStart}>
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextBtnText}>Start round</Text>
          )}
        </Pressable>
      </View>

      <TeePickerSheet
        visible={pickerTarget !== null && hasTees && scoringRule === 'stroke'}
        scorerName={pickerTarget ? resolveName(pickerTarget) : ''}
        tees={courseTees}
        selectedTeeId={pickerTarget ? teeIds[pickerTarget] : undefined}
        onCancel={() => setPickerTarget(null)}
        onPick={(teeId) => {
          if (!pickerTarget) return;
          setTeeIds((prev) => ({ ...prev, [pickerTarget]: teeId }));
          setPickerTarget(null);
        }}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    errorText: {
      fontSize: 13,
      textAlign: 'center',
    },
    content: {
      padding: 14,
      paddingTop: 8,
      paddingBottom: 32,
    },
    greeting: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.2,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginTop: 4,
      marginBottom: 14,
    },
    toggleRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 14,
    },
    toggle: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
    },
    toggleActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    toggleDisabled: {
      opacity: 0.45,
    },
    toggleText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textBody,
    },
    toggleTextActive: { color: '#fff' },
    toggleTextDisabled: { color: colors.textMuted },
    help: {
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      padding: 10,
      marginBottom: 14,
    },
    helpHead: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primaryDark,
    },
    helpBody: {
      fontSize: 12,
      color: colors.textBody,
      marginTop: 2,
    },
    list: { gap: 8 },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowAvatarText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
    },
    rowName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    teePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
    },
    teePillEmpty: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    teePillDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.15)',
    },
    teePillText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textTitle,
    },
    teePillTextEmpty: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    teePillChev: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: '800',
    },
    footer: {
      padding: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    nextBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    nextBtnDisabled: {
      backgroundColor: colors.primaryDark,
      opacity: 0.7,
    },
    nextBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 14,
      letterSpacing: 0.3,
    },
  });
}
