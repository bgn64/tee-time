import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { Avatar, GlassCard, GlassSurface, NeonButton, PHONE_MAX_WIDTH, SectionLabel, SegmentedToggle, StatChip } from '@/components/aurora';
import { ScrambleBody } from '@/components/scoring/ScrambleBody';
import { TeePickerSheet, teeSwatch } from '@/components/scoring/TeePickerSheet';
import { ToggleRow } from '@/components/widgets/ToggleRow';
import { BUILT_IN_STATS, defaultEnabledStatKeys, type StatKey } from '@/library/golf/builtInStats';
import { defaultTeeIdForCourse } from '@/library/golf/courseHelpers';
import { createCustomPlayer, softDeleteCustomPlayer, useCustomPlayers } from '@/library/golf/customPlayers';
import { customParticipantKey, userParticipantKey } from '@/library/golf/participantKey';
import { useRound } from '@/library/golf/RoundContext';
import { buildInitialScrambleState, buildTeamsFromGroups } from '@/library/golf/teams';
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
  const { course, loading: courseLoading, enriching: courseEnriching, error: courseError } = useCourse(courseId);

  const selfKey = useMemo(() => userParticipantKey(account.userId), [account.userId]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => [selfKey]);
  const [query, setQuery] = useState('');
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [namePromptValue, setNamePromptValue] = useState('');
  const namePromptInputRef = useRef<TextInput | null>(null);
  const [menuTarget, setMenuTarget] = useState<{ id: string; anchor: { x: number; y: number; width: number } } | null>(null);

  const [scoringRule, setScoringRule] = useState<ScoringRule>('stroke');
  const [teeIds, setTeeIds] = useState<Record<string, string | undefined>>(() => ({ [selfKey]: undefined }));
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [trackedScorerIds, setTrackedScorerIds] = useState<readonly string[]>([]);
  const [enabledStatKeys, setEnabledStatKeys] = useState<readonly StatKey[]>(() => defaultEnabledStatKeys());

  const defaultTeeId = course ? defaultTeeIdForCourse(course) : undefined;
  const [scrambleInit] = useState(() => buildInitialScrambleState([selfKey], defaultTeeId));
  const [scrambleGroups, setScrambleGroups] = useState<string[][]>(scrambleInit.groups);
  const [scrambleTeamIds, setScrambleTeamIds] = useState<string[]>(scrambleInit.teamIds);
  const [scrambleTeeIdByTeam, setScrambleTeeIdByTeam] = useState<Record<string, string | undefined>>(scrambleInit.teeIdByTeam);

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
      const teeId = scrambleTeeIdByTeam[team.id] ?? defaultTeeId;
      for (const pid of team.playerIds) out[pid] = teeId;
    }
    return out;
  }, [scrambleTeams, scrambleTeeIdByTeam, defaultTeeId]);
  const scrambleCanStart = scrambleTeams.length > 0 && scrambleTeams.every((t) => t.playerIds.length > 0);
  const validTrackedScorerIds = useMemo(
    () => new Set(scoringRule === 'scramble' ? scrambleTeams.map((t) => t.id) : selectedKeys),
    [scoringRule, scrambleTeams, selectedKeys]
  );
  const effectiveTrackedScorerIds = useMemo(
    () => trackedScorerIds.filter((id) => validTrackedScorerIds.has(id)),
    [trackedScorerIds, validTrackedScorerIds]
  );

  if (!roundHydrated) return <CenteredSpinner label="Preparing setup…" styles={styles} colors={colors} />;
  if (currentRound) return <Redirect href="/(tabs)/(score)/scoring" />;
  if (courseLoading || courseEnriching) return <CenteredSpinner label={courseEnriching ? 'Loading scorecard…' : 'Loading course…'} styles={styles} colors={colors} />;
  if (!course || !courseId) {
    return (
      <View style={styles.centered}>
        <GlassCard strong><Text style={styles.errorText}>{courseError ?? 'Missing course. Go back and try again.'}</Text></GlassCard>
      </View>
    );
  }

  const atCap = selectedKeys.length >= MAX_PLAYERS;
  const trimmedQuery = query.trim();
  const searchActive = trimmedQuery.length > 0;
  const friendEntries: FriendEntry[] = friends.map((uid) => ({ kind: 'friend', participantKey: userParticipantKey(uid), userId: uid }));
  const customEntries: CustomEntry[] = customRows.map((c) => ({ kind: 'custom', participantKey: customParticipantKey(c.id), customPlayerId: c.id }));
  function matchesSearch(entry: ListEntry): boolean {
    if (!searchActive) return true;
    const q = trimmedQuery.toLowerCase();
    const resolved = resolver.get(entry.participantKey);
    return !!(resolved?.displayName?.toLowerCase().includes(q) || resolved?.handle?.toLowerCase().includes(q));
  }
  function nameOf(entry: ListEntry): string { return resolver.get(entry.participantKey)?.displayName || ''; }
  const visibleFriends = friendEntries.filter(matchesSearch).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const visibleCustoms = customEntries.filter(matchesSearch).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const emptyVisible = !searchActive && visibleFriends.length === 0 && visibleCustoms.length === 0;

  function resolveName(playerId: string): string { return playerId === selfKey ? account.displayName || 'You' : resolver.get(playerId)?.displayName || 'Player'; }
  function resolveColor(playerId: string): string { return playerId === selfKey ? account.avatarColor : resolver.get(playerId)?.avatarColor || colors.cyan; }
  function commitSelectedKeys(nextKeys: string[]) {
    setSelectedKeys(nextKeys);
    setTeeIds((prev) => {
      const next: Record<string, string | undefined> = {};
      for (const key of nextKeys) next[key] = prev[key];
      return next;
    });
    const nextGroups = syncGroupsToPlayers(scrambleGroups, nextKeys);
    const nextTeamIds = syncTeamIds(scrambleTeamIds, nextGroups.length);
    setScrambleGroups(nextGroups);
    setScrambleTeamIds(nextTeamIds);
    setScrambleTeeIdByTeam((prev) => {
      const next: Record<string, string | undefined> = {};
      for (const id of nextTeamIds) next[id] = prev[id] ?? defaultTeeId;
      return next;
    });
    if (scoringRule === 'scramble' && nextKeys.length < 2) setScoringRule('stroke');
    const valid = new Set(scoringRule === 'scramble' ? nextTeamIds : nextKeys);
    setTrackedScorerIds((prev) => prev.filter((id) => valid.has(id)));
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
  function removeSelected(participantKey: string) { if (participantKey !== selfKey) commitSelectedKeys(selectedKeys.filter((k) => k !== participantKey)); }
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
    if (searchActive) { void createAndSelect(trimmedQuery); setQuery(''); return; }
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
  const toggleScorerId = (id: string) => setTrackedScorerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleStatKey = (key: StatKey) => setEnabledStatKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  async function handleStart() {
    if (starting || selectedKeys.length === 0) return;
    setStarting(true); setStartError(null);
    try {
      const finalEnabledStatKeys = effectiveTrackedScorerIds.length > 0 ? enabledStatKeys : [];
      if (scoringRule === 'scramble') {
        if (!scrambleCanStart || scrambleTeams.length === 0) throw new Error('Every team needs at least one player.');
        await startRound({ course: course!, playerIds: scrambleTeams.flatMap((t) => t.playerIds), holeRange: 'all', teeIds: scrambleTeeIdByParticipant, scoringRule: 'scramble', teams: scrambleTeams, enabledStatKeys: finalEnabledStatKeys, trackedScorerIds: effectiveTrackedScorerIds });
      } else {
        await startRound({ course: course!, playerIds: selectedKeys, holeRange: 'all', teeIds, enabledStatKeys: finalEnabledStatKeys, trackedScorerIds: effectiveTrackedScorerIds });
      }
      navigation.reset({ index: 1, routes: [{ name: 'index' as never }, { name: 'scoring' as never }] });
    } catch (err: unknown) {
      setStartError(err instanceof Error ? err.message : String(err)); setStarting(false);
    }
  }
  const startDisabled = starting || selectedKeys.length === 0 || (scoringRule === 'scramble' && !scrambleCanStart);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>New round setup</Text>
          <Text style={styles.title}>Dial in the card</Text>
          <GlassSurface style={styles.courseField} strong>
            <Ionicons name="flag" size={18} color={colors.lime} />
            <View style={styles.courseCopy}>
              <Text style={styles.courseName} numberOfLines={1}>{course.name}</Text>
              <Text style={styles.courseMeta} numberOfLines={1}>{course.location || `${course.holes.length} holes`}</Text>
            </View>
          </GlassSurface>
        </View>
        <GlassCard strong style={styles.card}>
          <SectionLabel style={styles.firstSection}>Format</SectionLabel>
          <SegmentedToggle
            value={scoringRule}
            onChange={(value) => { if (value === 'scramble' && selectedKeys.length < 2) return; setScoringRule(value); }}
            options={[{ key: 'stroke', label: 'Stroke', sublabel: 'Individual' }, { key: 'scramble', label: 'Scramble', sublabel: selectedKeys.length < 2 ? '2+ players' : 'Teams' }]}
          />
          <Text style={styles.helperText}>{scoringRule === 'stroke' ? 'Everyone scores their own ball. Pick tees per player below.' : 'Move players between teams below. Each team shares a tee.'}</Text>
        </GlassCard>
        <GlassCard strong style={styles.card}>
          <SectionLabel style={styles.firstSection} right={<Text style={styles.countText}>{selectedKeys.length}/{MAX_PLAYERS}</Text>}>Players</SectionLabel>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search friends or custom players" placeholderTextColor={colors.textMuted} autoCorrect={false} autoCapitalize="words" />
            {searchActive ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close" size={16} color={colors.textMuted} /></Pressable> : null}
          </View>
          <View style={styles.selectedRail}>
            {selectedKeys.map((key) => {
              const name = resolveName(key); const isSelf = key === selfKey;
              return <View key={key} style={[styles.selectedChip, isSelf && styles.selectedChipSelf]}><Avatar initial={name[0] ?? '?'} color={resolveColor(key)} size={24} circle /><Text style={styles.selectedChipText}>{isSelf ? 'You' : name}</Text>{!isSelf ? <Pressable onPress={() => removeSelected(key)} hitSlop={6}><Ionicons name="close" size={13} color={colors.textMuted} /></Pressable> : null}</View>;
            })}
          </View>
          <Pressable style={({ pressed }) => [styles.addRow, searchActive && styles.addRowActive, atCap && styles.disabled, pressed && !atCap ? styles.pressed : null]} disabled={atCap} onPress={handleAddRowPress}>
            <View style={styles.addIcon}><Ionicons name="add" size={18} color={searchActive ? colors.onNeon : colors.lime} /></View>
            <Text style={[styles.addText, searchActive && styles.addTextActive]}>{searchActive ? `Add "${trimmedQuery}" as a custom player` : 'Add custom player'}</Text>
          </Pressable>
          <PlayerRow label={account.displayName || 'You'} sublabel="You" color={account.avatarColor} selected pinned onPress={() => undefined} styles={styles} colors={colors} />
          {visibleFriends.length > 0 ? <SectionLabel>Friends</SectionLabel> : null}
          {visibleFriends.map((entry) => <PlayerRowFriend key={entry.participantKey} entry={entry} resolver={resolver} selected={selectedKeys.includes(entry.participantKey)} atCap={atCap} onToggle={() => toggleSelected(entry.participantKey)} styles={styles} colors={colors} />)}
          {visibleCustoms.length > 0 ? <SectionLabel>Custom players</SectionLabel> : null}
          {visibleCustoms.map((entry) => <PlayerRowCustom key={entry.participantKey} entry={entry} resolver={resolver} selected={selectedKeys.includes(entry.participantKey)} atCap={atCap} onToggle={() => toggleSelected(entry.participantKey)} onOpenMenu={(anchor) => setMenuTarget({ id: entry.customPlayerId, anchor })} styles={styles} colors={colors} />)}
          {emptyVisible ? <Text style={styles.emptyText}>No friends or custom players yet. Add a custom player to score with them today.</Text> : null}
          {searchActive && visibleFriends.length === 0 && visibleCustoms.length === 0 ? <Text style={styles.emptyText}>No matches for “{trimmedQuery}”. Use the add row above.</Text> : null}
        </GlassCard>
        <GlassCard strong style={styles.card}>
          <SectionLabel style={styles.firstSection}>{scoringRule === 'stroke' ? 'Tees' : 'Teams & tees'}</SectionLabel>
          {scoringRule === 'stroke' ? (
            <View style={styles.list}>
              {selectedKeys.map((id) => {
                const tee = teeIds[id] ? teeById.get(teeIds[id]!) : undefined;
                return (
                  <View key={id} style={styles.teeRow}>
                    <Avatar initial={resolveName(id)[0] ?? '?'} color={resolveColor(id)} size={34} circle />
                    <Text style={styles.teeName} numberOfLines={1}>{id === selfKey ? 'You' : resolveName(id)}</Text>
                    {hasTees ? (
                      <Pressable style={[styles.teePill, !tee && styles.teePillEmpty]} onPress={() => setPickerTarget(id)}>
                        {tee ? <View style={[styles.teeDot, { backgroundColor: teeSwatch(tee, colors) }]} /> : null}
                        <Text style={tee ? styles.teePillText : styles.teePillTextEmpty} numberOfLines={1}>{tee ? tee.name : '+ Tee'}</Text>
                        <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
                      </Pressable>
                    ) : <Text style={styles.noTeesText}>No tee data</Text>}
                  </View>
                );
              })}
            </View>
          ) : (
            <ScrambleBody playerIds={selectedKeys} resolver={resolver} selfParticipantKey={selfParticipantKey} firstNameForSelf={selfFirstName} courseTees={courseTees} defaultTeeId={defaultTeeId} groups={scrambleGroups} setGroups={setScrambleGroups} teamIds={scrambleTeamIds} setTeamIds={setScrambleTeamIds} teeIdByTeam={scrambleTeeIdByTeam} setTeeIdByTeam={setScrambleTeeIdByTeam} />
          )}
        </GlassCard>
        <GlassCard strong style={styles.card}>
          <SectionLabel style={styles.firstSection}>Track stats</SectionLabel>
          <Text style={styles.helperText}>Optional. Choose whose detail stats are recorded, then pick the stat chips.</Text>
          <View style={styles.configCard}>
            <Text style={styles.configCardLabel}>Track for</Text>
            {scoringRule === 'scramble'
              ? scrambleTeams.map((team, i) => <View key={team.id} style={i > 0 ? styles.toggleRowSep : null}><ToggleRow label={team.name} value={effectiveTrackedScorerIds.includes(team.id)} onToggle={() => toggleScorerId(team.id)} disabled={team.playerIds.length === 0} /></View>)
              : selectedKeys.map((id, i) => <View key={id} style={i > 0 ? styles.toggleRowSep : null}><ToggleRow label={id === selfKey ? 'You' : resolveName(id)} value={effectiveTrackedScorerIds.includes(id)} onToggle={() => toggleScorerId(id)} leading={<Avatar initial={resolveName(id)[0] ?? '?'} color={resolveColor(id)} size={28} circle />} /></View>)}
          </View>
          {effectiveTrackedScorerIds.length > 0 ? <View style={styles.statChips}>{BUILT_IN_STATS.map((stat) => <StatChip key={stat.key} label={stat.label} state={enabledStatKeys.includes(stat.key) ? 'on' : 'neutral'} onPress={() => toggleStatKey(stat.key)} />)}</View> : null}
        </GlassCard>
        {startError ? <Text style={styles.startError}>{startError}</Text> : null}
      </ScrollView>
      <View style={styles.footerWrap} pointerEvents="box-none">
        <GlassSurface strong style={styles.footer}>
          <NeonButton label={starting ? 'Starting…' : 'Start round'} disabled={startDisabled} onPress={handleStart} iconRight={starting ? <ActivityIndicator color={colors.onNeon} /> : <Ionicons name="arrow-forward" size={17} color={colors.onNeon} />} />
        </GlassSurface>
      </View>
      <TeePickerSheet visible={pickerTarget !== null && hasTees && scoringRule === 'stroke'} scorerName={pickerTarget ? resolveName(pickerTarget) : ''} tees={courseTees} selectedTeeId={pickerTarget ? teeIds[pickerTarget] : undefined} onCancel={() => setPickerTarget(null)} onPick={(teeId) => { if (!pickerTarget) return; setTeeIds((prev) => ({ ...prev, [pickerTarget]: teeId })); setPickerTarget(null); }} />
      <NamePromptModal visible={namePromptOpen} value={namePromptValue} setValue={setNamePromptValue} inputRef={namePromptInputRef} onCancel={cancelNamePrompt} onSubmit={submitNamePrompt} styles={styles} colors={colors} />
      <CustomPlayerMenu target={menuTarget} onClose={() => setMenuTarget(null)} onDelete={(id) => void handleDeleteCustom(id)} styles={styles} />
    </View>
  );
}

function CenteredSpinner({ label, styles, colors }: { label: string; styles: RowStyles; colors: ThemeColors }) {
  return <View style={styles.centered}><ActivityIndicator color={colors.lime} /><Text style={styles.loadingText}>{label}</Text></View>;
}

function PlayerRowFriend({ entry, resolver, selected, atCap, onToggle, styles, colors }: { entry: FriendEntry; resolver: ReturnType<typeof useParticipantResolver>; selected: boolean; atCap: boolean; onToggle: () => void; styles: RowStyles; colors: ThemeColors }) {
  const resolved = resolver.get(entry.participantKey);
  return <PlayerRow label={resolved?.displayName || 'Player'} sublabel={resolved?.handle ? `@${resolved.handle}` : 'Friend'} color={resolved?.avatarColor || colors.cyan} selected={selected} disabled={!selected && atCap} onPress={onToggle} styles={styles} colors={colors} />;
}

function PlayerRowCustom({ entry, resolver, selected, atCap, onToggle, onOpenMenu, styles, colors }: { entry: CustomEntry; resolver: ReturnType<typeof useParticipantResolver>; selected: boolean; atCap: boolean; onToggle: () => void; onOpenMenu: (anchor: { x: number; y: number; width: number }) => void; styles: RowStyles; colors: ThemeColors }) {
  const resolved = resolver.get(entry.participantKey);
  const dotsRef = useRef<View>(null);
  const openMenu = useCallback(() => { dotsRef.current?.measureInWindow((x, y, width) => onOpenMenu({ x, y, width })); }, [onOpenMenu]);
  const onDotsLayout = useCallback((_event: LayoutChangeEvent) => undefined, []);
  return <PlayerRow label={resolved?.displayName || 'Player'} sublabel="Custom" color={resolved?.avatarColor || colors.violet} selected={selected} disabled={!selected && atCap} onPress={onToggle} styles={styles} colors={colors} right={<Pressable ref={dotsRef} onLayout={onDotsLayout} onPress={(event) => { event.stopPropagation(); openMenu(); }} hitSlop={8} style={styles.dotsBtn}><Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} /></Pressable>} />;
}

function PlayerRow({ label, sublabel, color, selected, pinned, disabled, onPress, styles, colors, right }: { label: string; sublabel: string; color: string; selected: boolean; pinned?: boolean; disabled?: boolean; onPress: () => void; styles: RowStyles; colors: ThemeColors; right?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={disabled || pinned} style={({ pressed }) => [styles.player, selected && styles.playerSelected, disabled && styles.disabled, pressed && !disabled ? styles.pressed : null]}>
      <View><Avatar initial={label[0] ?? '?'} color={color} size={38} circle />{selected ? <View style={styles.checkBadge}><Ionicons name="checkmark" size={10} color={colors.onNeon} /></View> : null}</View>
      <View style={styles.playerInfo}><Text style={styles.playerName} numberOfLines={1}>{label}</Text><Text style={styles.playerMeta} numberOfLines={1}>{pinned ? 'Pinned' : sublabel}</Text></View>
      {right ?? <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? colors.lime : colors.textMuted} />}
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
    playerSelected: { borderColor: colors.lime, backgroundColor: colors.glowLime },
    playerInfo: { flex: 1, minWidth: 0 },
    playerName: { color: colors.textTitle, fontSize: 14, fontWeight: '900' },
    playerMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
    checkBadge: { position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.night },
    dotsBtn: { padding: 6 },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    emptyText: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18, paddingVertical: 12 },
    teeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 18, padding: 10 },
    teeName: { flex: 1, minWidth: 0, color: colors.textTitle, fontSize: 14, fontWeight: '900' },
    teePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.glassFill2, borderWidth: 1, borderColor: colors.glassStroke, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 128 },
    teePillEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed' },
    teeDot: { width: 9, height: 9, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassStroke },
    teePillText: { flexShrink: 1, color: colors.textTitle, fontSize: 11, fontWeight: '900' },
    teePillTextEmpty: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    noTeesText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    configCard: { borderWidth: 1, borderColor: colors.glassStroke, backgroundColor: colors.glassFill, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
    configCardLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8, marginBottom: 2 },
    toggleRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
    statChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
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
