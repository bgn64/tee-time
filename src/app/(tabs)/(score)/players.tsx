import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { Avatar, GlassCard, GlassSurface, NeonButton, PHONE_MAX_WIDTH, SectionLabel } from '@/components/aurora';
import { ScrambleBody } from '@/components/scoring/ScrambleBody';
import { TeePickerSheet, teeSwatch } from '@/components/scoring/TeePickerSheet';
import { defaultEnabledStatKeys, type StatKey } from '@/library/golf/builtInStats';
import { defaultTeeIdForCourse } from '@/library/golf/courseHelpers';
import { createCustomPlayer, softDeleteCustomPlayer, useCustomPlayers } from '@/library/golf/customPlayers';
import { customParticipantKey, userParticipantKey } from '@/library/golf/participantKey';
import { useRound } from '@/library/golf/RoundContext';
import { buildInitialScrambleState, buildTeamsFromGroups } from '@/library/golf/teams';
import { useCompletedRounds } from '@/library/golf/useCompletedRounds';
import { useCourse } from '@/library/golf/useCourses';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import { numericFontVariant, type ThemeColors } from '@/library/theme/themes';
import { confirmAsync, showAlert } from '@/library/utils/alert';
import type { ScoringRule, Tee, Team } from '@/types/golf';

const MAX_PLAYERS = 4;
const NEW_TEAM_PLACEHOLDER = 'New team';
const STAT_OPTIONS: readonly { key: StatKey; label: string }[] = [
  { key: 'fir', label: 'Fairways' },
  { key: 'gir', label: 'Greens' },
  { key: 'putts', label: 'Putts' },
  { key: 'ob', label: 'Penalties' },
  { key: 'sand', label: 'Sand' },
];

type FriendEntry = { kind: 'friend'; participantKey: string; userId: string };
type CustomEntry = { kind: 'custom'; participantKey: string; customPlayerId: string };
type ListEntry = FriendEntry | CustomEntry;
type RowStyles = Record<string, any>;

export default function PlayersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const { currentRound, roundHydrated, startRound, userId } = useRound();
  const navigation = useNavigation();
  const account = useRequiredAccount();
  const { friends } = useFriends();
  const { customPlayers: customRows } = useCustomPlayers(account.userId);
  const { rounds: completedRounds } = useCompletedRounds();
  const defaultCourseId = useMemo(() => {
    const latest = completedRounds.reduce<(typeof completedRounds)[number] | null>(
      (acc, round) => {
        if (!acc) return round;
        const a = new Date(round.completedAt ?? round.startedAt).getTime();
        const b = new Date(acc.completedAt ?? acc.startedAt).getTime();
        return a > b ? round : acc;
      },
      null
    );
    return latest?.course.id;
  }, [completedRounds]);
  const activeCourseId = courseId ?? defaultCourseId;
  const { course, loading: courseLoading, enriching: courseEnriching, error: courseError, retry: retryCourse } = useCourse(activeCourseId);
  const courseHasHoles = (course?.holes?.length ?? 0) > 0;
  const courseReady = !!course && courseHasHoles;

  const selfKey = useMemo(() => userParticipantKey(account.userId), [account.userId]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => [selfKey]);
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [namePromptValue, setNamePromptValue] = useState('');
  const namePromptInputRef = useRef<TextInput | null>(null);
  const [menuTarget, setMenuTarget] = useState<{ id: string; anchor: { x: number; y: number; width: number } } | null>(null);

  const [scoringRule, setScoringRule] = useState<ScoringRule>('stroke');
  const [roundTeeId, setRoundTeeId] = useState<string | undefined>(undefined);
  const [teePickerOpen, setTeePickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [enabledStatKeys, setEnabledStatKeys] = useState<readonly StatKey[]>(() =>
    defaultEnabledStatKeys().filter((key) => key !== 'ob')
  );

  const defaultTeeId = course ? defaultTeeIdForCourse(course) : undefined;
  const [scrambleInit] = useState(() => buildInitialScrambleState([selfKey], undefined));
  const [scrambleGroups, setScrambleGroups] = useState<string[][]>(scrambleInit.groups);
  const [scrambleTeamIds, setScrambleTeamIds] = useState<string[]>(scrambleInit.teamIds);
  const [, setScrambleTeeIdByTeam] = useState<Record<string, string | undefined>>(scrambleInit.teeIdByTeam);

  const resolverKeys = useMemo(() => {
    const set = new Set<string>([selfKey]);
    for (const uid of friends) set.add(userParticipantKey(uid));
    for (const c of customRows) set.add(customParticipantKey(c.id));
    for (const k of selectedKeys) set.add(k);
    return Array.from(set);
  }, [selfKey, friends, customRows, selectedKeys]);
  const resolver = useParticipantResolver(resolverKeys);

  const courseTees: Tee[] = useMemo(() => course?.tees ?? [], [course?.tees]);
  const hasTees = courseTees.length > 0;
  const teeById = useMemo(() => new Map(courseTees.map((t) => [t.id, t])), [courseTees]);
  const selectedTeeId = roundTeeId && teeById.has(roundTeeId) ? roundTeeId : defaultTeeId;
  const selfParticipantKey = userId ? userParticipantKey(userId) : undefined;
  const selfFirstName = useMemo(() => {
    if (!selfParticipantKey) return undefined;
    const name = resolver.get(selfParticipantKey)?.displayName?.trim();
    return name ? name.split(/\s+/)[0] : undefined;
  }, [resolver, selfParticipantKey]);

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
    ).map((t, i) => (scrambleGroups[i].length === 0 ? { ...t, name: NEW_TEAM_PLACEHOLDER } : t));
  }, [scrambleGroups, scrambleTeamIds, resolver, selfParticipantKey, selfFirstName]);

  const scrambleTeeIdByParticipant = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const team of scrambleTeams) {
      for (const pid of team.playerIds) out[pid] = selectedTeeId;
    }
    return out;
  }, [scrambleTeams, selectedTeeId]);
  const scrambleCanStart = scrambleTeams.length > 0 && scrambleTeams.every((t) => t.playerIds.length > 0);
  const globalTeeIdByTeam = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const id of scrambleTeamIds) out[id] = selectedTeeId;
    return out;
  }, [scrambleTeamIds, selectedTeeId]);

  if (!roundHydrated) return <CenteredSpinner label="Preparing setup…" styles={styles} colors={colors} />;
  if (currentRound) return <Redirect href="/(tabs)/(score)/scoring" />;
  if (activeCourseId && (courseLoading || courseEnriching)) return <CenteredSpinner label={courseEnriching ? 'Loading scorecard…' : 'Loading course…'} styles={styles} colors={colors} />;

  const atCap = selectedKeys.length >= MAX_PLAYERS;
  const friendEntries: FriendEntry[] = friends.map((uid) => ({ kind: 'friend', participantKey: userParticipantKey(uid), userId: uid }));
  const customEntries: CustomEntry[] = customRows.map((c) => ({ kind: 'custom', participantKey: customParticipantKey(c.id), customPlayerId: c.id }));
  function nameOf(entry: ListEntry): string { return resolver.get(entry.participantKey)?.displayName || ''; }
  const visibleFriends = friendEntries.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const visibleCustoms = customEntries.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const emptyVisible = visibleFriends.length === 0 && visibleCustoms.length === 0;

  function commitSelectedKeys(nextKeys: string[]) {
    setSelectedKeys(nextKeys);
    const nextGroups = syncGroupsToPlayers(scrambleGroups, nextKeys);
    const nextTeamIds = syncTeamIds(scrambleTeamIds, nextGroups.length);
    setScrambleGroups(nextGroups);
    setScrambleTeamIds(nextTeamIds);
    setScrambleTeeIdByTeam((prev) => {
      const next: Record<string, string | undefined> = {};
      for (const id of nextTeamIds) next[id] = prev[id] ?? selectedTeeId;
      return next;
    });
    if (scoringRule === 'scramble' && nextKeys.length < 2) setScoringRule('stroke');
  }
  function toggleSelected(participantKey: string) {
    if (participantKey === selfKey) return;
    if (selectedKeys.includes(participantKey)) {
      commitSelectedKeys(selectedKeys.filter((k) => k !== participantKey));
      return;
    }
    if (selectedKeys.length >= MAX_PLAYERS) return;
    commitSelectedKeys([...selectedKeys, participantKey]);
  }
  async function createAndSelect(rawNickname: string) {
    if (atCap) return;
    const nickname = rawNickname.trim();
    if (nickname.length === 0) return;
    try {
      const created = await createCustomPlayer(account.userId, nickname);
      const key = customParticipantKey(created.id);
      if (!selectedKeys.includes(key) && selectedKeys.length < MAX_PLAYERS) commitSelectedKeys([...selectedKeys, key]);
    } catch (err: unknown) {
      showAlert('Could not add player', err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }
  function handleAddRowPress() {
    if (atCap) return;
    setNamePromptValue(''); setNamePromptOpen(true);
  }
  function submitNamePrompt() {
    const value = namePromptValue.trim();
    if (value.length === 0) return;
    void createAndSelect(value); setNamePromptOpen(false); setNamePromptValue('');
  }
  function cancelNamePrompt() { setNamePromptOpen(false); setNamePromptValue(''); }
  async function handleDeleteCustom(customPlayerId: string) {
    setMenuTarget(null);
    const ok = await confirmAsync('Delete custom player?', "They'll disappear from your picker but still show up correctly on rounds you've already scored.");
    if (!ok) return;
    try {
      await softDeleteCustomPlayer(customPlayerId);
      commitSelectedKeys(selectedKeys.filter((k) => k !== customParticipantKey(customPlayerId)));
    } catch (err: unknown) {
      showAlert('Could not delete player', err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }
  const toggleStatKey = (key: StatKey) => setEnabledStatKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  async function handleStart() {
    if (starting || selectedKeys.length === 0 || !courseReady) return;
    setStarting(true); setStartError(null);
    try {
      const finalEnabledStatKeys = enabledStatKeys;
      if (scoringRule === 'scramble') {
        if (!scrambleCanStart || scrambleTeams.length === 0) throw new Error('Every team needs at least one player.');
        await startRound({
          course: course!,
          playerIds: scrambleTeams.flatMap((t) => t.playerIds),
          holeRange: 'all',
          teeIds: scrambleTeeIdByParticipant,
          scoringRule: 'scramble',
          teams: scrambleTeams,
          enabledStatKeys: finalEnabledStatKeys,
          trackedScorerIds: finalEnabledStatKeys.length > 0 ? scrambleTeams.map((t) => t.id) : [],
        });
      } else {
        const teeIds = Object.fromEntries(selectedKeys.map((key) => [key, selectedTeeId]));
        await startRound({
          course: course!,
          playerIds: selectedKeys,
          holeRange: 'all',
          teeIds,
          enabledStatKeys: finalEnabledStatKeys,
          trackedScorerIds: finalEnabledStatKeys.length > 0 ? selectedKeys : [],
        });
      }
      navigation.reset({ index: 1, routes: [{ name: 'index' as never }, { name: 'scoring' as never }] });
    } catch (err: unknown) {
      setStartError(err instanceof Error ? err.message : String(err)); setStarting(false);
    }
  }
  const startDisabled = starting || !courseReady || courseLoading || courseEnriching || selectedKeys.length === 0 || (scoringRule === 'scramble' && !scrambleCanStart);
  const selectedTee = selectedTeeId ? teeById.get(selectedTeeId) : undefined;
  const courseValue = course?.name ?? (activeCourseId ? 'Course unavailable' : 'Choose a course');
  const teeValue = selectedTee ? formatTeeValue(selectedTee) : hasTees ? 'Choose tees' : 'No tee data';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>New round</Text>
        <SectionLabel style={styles.firstSection}>Course</SectionLabel>
        <Pressable onPress={() => router.push('/(tabs)/(score)/new' as never)} style={({ pressed }) => [pressed && styles.pressed]}>
          <GlassSurface style={styles.courseField} strong>
            <Ionicons name="golf" size={18} color={colors.cyan} />
            <View style={styles.courseCopy}>
              <Text style={styles.courseMeta}>Selected course</Text>
              <Text style={[styles.courseName, !course && styles.placeholder]} numberOfLines={1}>{courseValue}</Text>
              {activeCourseId && (courseError || (course && !courseHasHoles && !courseLoading && !courseEnriching)) ? (
                <Text style={styles.inlineError} numberOfLines={2}>
                  {courseError ?? 'No scorecard data for this course yet, so it cannot be scored.'}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </GlassSurface>
        </Pressable>

        {activeCourseId && !courseLoading && !courseEnriching && (courseError || (course && !courseHasHoles)) ? (
          <Pressable onPress={() => retryCourse()} style={({ pressed }) => [styles.retryRow, pressed && styles.pressed]}>
            <Ionicons name="refresh" size={16} color={colors.cyan} />
            <Text style={styles.retryText}>Try loading this course again</Text>
          </Pressable>
        ) : null}
        {activeCourseId && (courseLoading || courseEnriching) ? (
          <View style={styles.retryRow}>
            <ActivityIndicator color={colors.lime} />
            <Text style={styles.retryTextMuted}>Loading course data…</Text>
          </View>
        ) : null}

        <SectionLabel>Format</SectionLabel>
        <View style={styles.choiceRow}>
          <ChoiceCard label="Stroke" sublabel="solo · individual" selected={scoringRule === 'stroke'} onPress={() => setScoringRule('stroke')} styles={styles} />
          <ChoiceCard label="Scramble" sublabel="teams · best ball" selected={scoringRule === 'scramble'} disabled={selectedKeys.length < 2} onPress={() => setScoringRule('scramble')} styles={styles} />
        </View>
        {scoringRule === 'scramble' ? (
          <GlassCard strong style={styles.card}>
            <ScrambleBody playerIds={selectedKeys} resolver={resolver} selfParticipantKey={selfParticipantKey} firstNameForSelf={selfFirstName} courseTees={[]} defaultTeeId={selectedTeeId} groups={scrambleGroups} setGroups={setScrambleGroups} teamIds={scrambleTeamIds} setTeamIds={setScrambleTeamIds} teeIdByTeam={globalTeeIdByTeam} setTeeIdByTeam={setScrambleTeeIdByTeam} />
          </GlassCard>
        ) : null}

        <SectionLabel right={<Text style={styles.countText}>{selectedKeys.length} selected</Text>}>Players</SectionLabel>
        <GlassCard strong style={styles.card}>
          <PlayerRow label={account.displayName || 'You'} sublabel="host" color={account.avatarColor} selected pinned onPress={() => undefined} styles={styles} colors={colors} self />
          {visibleFriends.map((entry) => <PlayerRowFriend key={entry.participantKey} entry={entry} resolver={resolver} selected={selectedKeys.includes(entry.participantKey)} atCap={atCap} onToggle={() => toggleSelected(entry.participantKey)} styles={styles} colors={colors} />)}
          {visibleCustoms.map((entry) => <PlayerRowCustom key={entry.participantKey} entry={entry} resolver={resolver} selected={selectedKeys.includes(entry.participantKey)} atCap={atCap} onToggle={() => toggleSelected(entry.participantKey)} onOpenMenu={(anchor) => setMenuTarget({ id: entry.customPlayerId, anchor })} styles={styles} colors={colors} />)}
          {emptyVisible ? <Text style={styles.emptyText}>No friends or custom players yet. Add a custom player to score with them today.</Text> : null}
          <Pressable style={({ pressed }) => [styles.addRow, atCap && styles.disabled, pressed && !atCap ? styles.pressed : null]} disabled={atCap} onPress={handleAddRowPress}>
            <View style={styles.addIcon}><Ionicons name="add" size={18} color={colors.textMuted} /></View>
            <Text style={styles.addText}>Add custom player</Text>
          </Pressable>
        </GlassCard>

        <SectionLabel>Tees</SectionLabel>
        <Pressable disabled={!hasTees} onPress={() => setTeePickerOpen(true)} style={({ pressed }) => [pressed && hasTees ? styles.pressed : null]}>
          <GlassSurface style={[styles.courseField, !hasTees && styles.disabled]} strong>
            <Ionicons name="flag" size={18} color={colors.cyan} />
            <View style={styles.courseCopy}>
              <Text style={styles.courseMeta}>Tees</Text>
              <View style={styles.teeValue}>
                {selectedTee ? <View style={[styles.teeDot, { backgroundColor: teeSwatch(selectedTee, colors) }]} /> : null}
                <Text style={[styles.courseName, !selectedTee && styles.placeholder]} numberOfLines={1}>{teeValue}</Text>
              </View>
            </View>
            {hasTees ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
          </GlassSurface>
        </Pressable>

        <SectionLabel>Track stats</SectionLabel>
        <View style={styles.statChips}>
          {STAT_OPTIONS.map((stat) => {
            const selected = enabledStatKeys.includes(stat.key);
            return <Pressable key={stat.key} onPress={() => toggleStatKey(stat.key)} style={({ pressed }) => [styles.statToggle, selected && styles.statToggleOn, pressed && styles.pressed]}><Text style={[styles.statMark, selected && styles.statMarkOn]}>{selected ? '✓' : '+'}</Text><Text style={[styles.statText, selected && styles.statTextOn]}>{stat.label}</Text></Pressable>;
          })}
        </View>
        {startError ? <Text style={styles.startError}>{startError}</Text> : null}
      </ScrollView>
      <View style={styles.footerWrap} pointerEvents="box-none">
        <GlassSurface strong style={styles.footer}>
          <NeonButton label={starting ? 'Starting…' : 'Start round'} disabled={startDisabled} onPress={handleStart} iconRight={starting ? <ActivityIndicator color={colors.onNeon} /> : <Ionicons name="arrow-forward" size={17} color={colors.onNeon} />} />
        </GlassSurface>
      </View>
      <TeePickerSheet visible={teePickerOpen && hasTees} scorerName="Round" tees={courseTees} selectedTeeId={selectedTeeId} onCancel={() => setTeePickerOpen(false)} onPick={(teeId) => { setRoundTeeId(teeId); setTeePickerOpen(false); }} />
      <NamePromptModal visible={namePromptOpen} value={namePromptValue} setValue={setNamePromptValue} inputRef={namePromptInputRef} onCancel={cancelNamePrompt} onSubmit={submitNamePrompt} styles={styles} colors={colors} />
      <CustomPlayerMenu target={menuTarget} onClose={() => setMenuTarget(null)} onDelete={(id) => void handleDeleteCustom(id)} styles={styles} />
    </View>
  );
}

function CenteredSpinner({ label, styles, colors }: { label: string; styles: RowStyles; colors: ThemeColors }) {
  return <View style={styles.centered}><ActivityIndicator color={colors.lime} /><Text style={styles.loadingText}>{label}</Text></View>;
}

function ChoiceCard({ label, sublabel, selected, disabled, onPress, styles }: { label: string; sublabel: string; selected: boolean; disabled?: boolean; onPress: () => void; styles: RowStyles }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.choiceCard, selected && styles.choiceCardSelected, disabled && styles.disabled, pressed && !disabled ? styles.pressed : null]}><Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>{label}</Text><Text style={styles.choiceSub}>{sublabel}</Text></Pressable>;
}

function PlayerRowFriend({ entry, resolver, selected, atCap, onToggle, styles, colors }: { entry: FriendEntry; resolver: ReturnType<typeof useParticipantResolver>; selected: boolean; atCap: boolean; onToggle: () => void; styles: RowStyles; colors: ThemeColors }) {
  const resolved = resolver.get(entry.participantKey);
  return <PlayerRow label={resolved?.handle ? `@${resolved.handle}` : resolved?.displayName || 'Player'} sublabel="friend" color={resolved?.avatarColor || colors.cyan} selected={selected} disabled={!selected && atCap} onPress={onToggle} styles={styles} colors={colors} />;
}

function PlayerRowCustom({ entry, resolver, selected, atCap, onToggle, onOpenMenu, styles, colors }: { entry: CustomEntry; resolver: ReturnType<typeof useParticipantResolver>; selected: boolean; atCap: boolean; onToggle: () => void; onOpenMenu: (anchor: { x: number; y: number; width: number }) => void; styles: RowStyles; colors: ThemeColors }) {
  const resolved = resolver.get(entry.participantKey);
  const dotsRef = useRef<View>(null);
  const openMenu = useCallback(() => { dotsRef.current?.measureInWindow((x, y, width) => onOpenMenu({ x, y, width })); }, [onOpenMenu]);
  const onDotsLayout = useCallback((_event: LayoutChangeEvent) => undefined, []);
  return <PlayerRow label={resolved?.displayName || 'Player'} sublabel="guest · custom player" color={resolved?.avatarColor || colors.violet} selected={selected} disabled={!selected && atCap} onPress={onToggle} styles={styles} colors={colors} right={<Pressable ref={dotsRef} onLayout={onDotsLayout} onPress={(event) => { event.stopPropagation(); openMenu(); }} hitSlop={8} style={styles.dotsBtn}><Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} /></Pressable>} />;
}

function PlayerRow({ label, sublabel, color, selected, pinned, disabled, onPress, styles, colors, right, self }: { label: string; sublabel: string; color: string; selected: boolean; pinned?: boolean; disabled?: boolean; onPress: () => void; styles: RowStyles; colors: ThemeColors; right?: React.ReactNode; self?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled || pinned} style={({ pressed }) => [styles.player, disabled && styles.disabled, pressed && !disabled ? styles.pressed : null]}>
      <Avatar initial={label.replace('@', '')[0] ?? '?'} color={color} size={34} circle />
      <View style={styles.playerInfo}><Text style={styles.playerName} numberOfLines={1}>{label}{self ? <Text style={styles.youText}> YOU</Text> : null}</Text><Text style={styles.playerMeta} numberOfLines={1}>{sublabel}</Text></View>
      {right}
      <View style={[styles.checkCircle, selected && styles.checkCircleOn]}><Ionicons name="checkmark" size={14} color={selected ? colors.onNeon : 'transparent'} /></View>
    </Pressable>
  );
}

function NamePromptModal({ visible, value, setValue, inputRef, onCancel, onSubmit, styles, colors }: { visible: boolean; value: string; setValue: (value: string) => void; inputRef: React.RefObject<TextInput | null>; onCancel: () => void; onSubmit: () => void; styles: RowStyles; colors: ThemeColors }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel} onShow={() => setTimeout(() => inputRef.current?.focus(), 50)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.promptOverlay}>
        <Pressable style={styles.promptBackdrop} onPress={onCancel} />
        <GlassCard strong glow style={styles.promptCard}>
          <Text style={styles.promptTitle}>Add a custom player</Text>
          <Text style={styles.promptBody}>Score for someone off-app without creating an account for them.</Text>
          <TextInput ref={inputRef} style={styles.promptInput} value={value} onChangeText={setValue} placeholder="e.g. Dad, Mike, Sarah" placeholderTextColor={colors.textMuted} autoCapitalize="words" autoCorrect={false} returnKeyType="done" onSubmitEditing={onSubmit} maxLength={40} />
          <View style={styles.promptActions}><NeonButton label="Cancel" variant="ghost" onPress={onCancel} style={styles.promptButton} /><NeonButton label="Add" onPress={onSubmit} disabled={value.trim().length === 0} style={styles.promptButton} /></View>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CustomPlayerMenu({ target, onClose, onDelete, styles }: { target: { id: string; anchor: { x: number; y: number; width: number } } | null; onClose: () => void; onDelete: (id: string) => void; styles: RowStyles }) {
  return <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.menuBackdrop} onPress={onClose}>{target ? <GlassSurface strong style={[styles.menuPopover, { top: target.anchor.y + 28, left: Math.max(8, target.anchor.x - 140) }]}><Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={() => onDelete(target.id)}><Text style={styles.menuItemDanger}>Delete</Text></Pressable></GlassSurface> : null}</Pressable></Modal>;
}

function formatTeeValue(tee: Tee) {
  return `${tee.name}${tee.totalYardage ? ` · ${tee.totalYardage.toLocaleString()} yds` : ''}`;
}

function syncGroupsToPlayers(groups: string[][], playerIds: string[]) {
  const selected = new Set(playerIds);
  const next = groups.map((group) => group.filter((id) => selected.has(id))).filter((group) => group.length > 0);
  const assigned = new Set(next.flat());
  const missing = playerIds.filter((id) => !assigned.has(id));
  if (next.length === 0) return playerIds.length > 0 ? [[...playerIds]] : [];
  if (missing.length > 0) next[0] = [...next[0], ...missing];
  return nestedArraysEqual(groups, next) ? groups : next;
}
function syncTeamIds(ids: string[], count: number) { if (ids.length === count) return ids; if (ids.length > count) return ids.slice(0, count); return [...ids, ...Array.from({ length: count - ids.length }, () => `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)]; }
function arraysEqual(a: readonly string[], b: readonly string[]) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function nestedArraysEqual(a: string[][], b: string[][]) { return a.length === b.length && a.every((group, i) => arraysEqual(group, b[i])); }
function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: 'transparent' },
    loadingText: { marginTop: 10, color: colors.textMuted, fontWeight: '700' },
    errorText: { color: colors.textBody, textAlign: 'center', fontWeight: '700' },
    content: { width: '100%', maxWidth: PHONE_MAX_WIDTH, alignSelf: 'center', padding: 16, paddingTop: 16, paddingBottom: 120 },
    hero: { marginBottom: 14 },
    eyebrow: { color: colors.cyan, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
    title: { color: colors.textTitle, fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginTop: 4, marginBottom: 14 },
    courseField: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18 },
    courseCopy: { flex: 1, minWidth: 0 },
    courseName: { color: colors.textTitle, fontSize: 15, fontWeight: '900' },
    courseMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
    placeholder: { color: colors.textMuted },
    inlineError: { color: colors.accent, fontSize: 11, fontWeight: '800', marginTop: 3 },
    retryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginTop: 4 },
    retryText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
    retryTextMuted: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    choiceRow: { flexDirection: 'row', gap: 9, marginBottom: 14 },
    choiceCard: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 8 },
    choiceCardSelected: { borderColor: colors.lime, backgroundColor: colors.glowLime },
    choiceTitle: { color: colors.textTitle, fontSize: 14, fontWeight: '800' },
    choiceTitleSelected: { color: colors.lime },
    choiceSub: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
    card: { marginBottom: 14 },
    firstSection: { marginTop: 0 },
    helperText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600', lineHeight: 18, marginTop: 10 },
    countText: { color: colors.lime, fontSize: 12, fontWeight: '900', fontVariant: [...numericFontVariant] },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
    searchInput: { flex: 1, color: colors.textTitle, fontSize: 14, padding: 0 },
    selectedRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 999, paddingVertical: 4, paddingLeft: 4, paddingRight: 8 },
    selectedChipSelf: { borderColor: colors.lime, backgroundColor: colors.glowLime },
    selectedChipText: { color: colors.textTitle, fontSize: 12, fontWeight: '800' },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lime, backgroundColor: colors.glowLime, borderRadius: 16, padding: 12, marginBottom: 12 },
    addRowActive: { backgroundColor: colors.lime, borderStyle: 'solid' },
    addIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassFill2 },
    addText: { flex: 1, color: colors.lime, fontSize: 13, fontWeight: '900' },
    addTextActive: { color: colors.onNeon },
    list: { gap: 8 },
    player: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 18, padding: 10, marginBottom: 8 },
    youText: { color: colors.cyan, fontSize: 10, fontWeight: '900' },
    playerSelected: { borderColor: colors.lime, backgroundColor: colors.glowLime },
    playerInfo: { flex: 1, minWidth: 0 },
    playerName: { color: colors.textTitle, fontSize: 14, fontWeight: '900' },
    playerMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
    checkBadge: { position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.night },
    checkCircle: { marginLeft: 'auto', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassStroke, alignItems: 'center', justifyContent: 'center' },
    checkCircleOn: { backgroundColor: colors.lime, borderColor: 'transparent' },
    dotsBtn: { padding: 6 },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    emptyText: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18, paddingVertical: 12 },
    teeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 18, padding: 10 },
    teeName: { flex: 1, minWidth: 0, color: colors.textTitle, fontSize: 14, fontWeight: '900' },
    teePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.glassFill2, borderWidth: 1, borderColor: colors.glassStroke, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 128 },
    teePillEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed' },
    teeDot: { width: 9, height: 9, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassStroke },
    teeValue: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    teePillText: { flexShrink: 1, color: colors.textTitle, fontSize: 11, fontWeight: '900' },
    teePillTextEmpty: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    noTeesText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    configCard: { borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
    configCardLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8, marginBottom: 2 },
    toggleRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
    statChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    statToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, paddingVertical: 8, paddingHorizontal: 10 },
    statToggleOn: { borderColor: colors.lime, backgroundColor: colors.glowLime },
    statMark: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
    statMarkOn: { color: colors.lime },
    statText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
    statTextOn: { color: colors.textTitle },
    startError: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 4, marginBottom: 10 },
    footerWrap: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center', paddingHorizontal: 12 },
    footer: { width: '100%', maxWidth: PHONE_MAX_WIDTH, padding: 10, borderRadius: 24 },
    promptOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    promptBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    promptCard: { width: '100%', maxWidth: 380 },
    promptTitle: { color: colors.textTitle, fontSize: 18, fontWeight: '900', marginBottom: 6 },
    promptBody: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600', lineHeight: 18, marginBottom: 12 },
    promptInput: { borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: colors.textTitle, fontSize: 14, marginBottom: 12 },
    promptActions: { flexDirection: 'row', gap: 10 },
    promptButton: { flex: 1 },
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.001)' },
    menuPopover: { position: 'absolute', minWidth: 160, borderRadius: 16, paddingVertical: 6 },
    menuItem: { paddingVertical: 11, paddingHorizontal: 14 },
    menuItemDanger: { color: colors.accent, fontSize: 13, fontWeight: '900' },
  });
}
