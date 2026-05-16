/**
 * Player selection — Step 1 of the Score-tab round-setup flow.
 *
 * The user has already picked a course. This screen lets them choose
 * who else is in the round. "You" (the default player) is always
 * included and pinned. Tap a player to toggle. Selected players also
 * surface as removable chips beneath the search bar. Typing replaces
 * the recents list with fuzzy matches; an "Add new player" row at the
 * top of the list creates a new local roster entry in one tap (no
 * separate creation form).
 *
 * Footer "Next" routes to the format screen with the picked player
 * ids serialized as a URL param.
 */

import { router, useFocusEffect, useLocalSearchParams, Redirect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { newPlayerId } from '@/lib/ids';
import { firstName } from '@/lib/userIdentity';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Player } from '@/types/golf';

const MAX_PLAYERS = 4;

const NEW_PLAYER_COLORS = ['#7cb342', '#4a90e2', '#9c5dde', '#ff8f00', '#26a69a', '#ef5350', '#b07c4f'];

function pickColor(seedKey: string): string {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) hash = (hash * 31 + seedKey.charCodeAt(i)) | 0;
  return NEW_PLAYER_COLORS[Math.abs(hash) % NEW_PLAYER_COLORS.length];
}

/**
 * Gate component: if a round is already in progress, the user has no
 * business on the player-picker. Redirect them straight to `/scoring`
 * synchronously so the body never mounts (no header flash, no stale
 * selection state). See docs in `app/(tabs)/(score)/_layout.tsx` for
 * the broader "Finish / Abandon are the only round exits" invariant.
 */
export default function PlayersScreenGate() {
  const { currentRound } = useGolfRound();
  if (currentRound) {
    return <Redirect href="/(tabs)/(score)/scoring" />;
  }
  return <PlayersScreen />;
}

function PlayersScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { courses } = useGolfRound();
  const { allPlayers, recentPlayers, addPlayer, markRecent, defaultPlayerId, getPlayer } =
    usePlayers();
  const { profileCache } = useSocial();
  const { account } = useAccount();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    defaultPlayerId ? [defaultPlayerId] : []
  );
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [namePromptValue, setNamePromptValue] = useState('');
  const namePromptInputRef = useRef<TextInput | null>(null);
  const [query, setQuery] = useState<string>('');

  useScreenHeader({
    left: { kind: 'back', label: 'Course', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  // Reset selection when this screen regains focus (e.g., after a
  // back-then-forward navigation). Keeps the default player pinned.
  useFocusEffect(
    useCallback(() => {
      // No-op by design: we keep selections across focus changes so a
      // user popping back from format can adjust the player list.
    }, [])
  );

  const course = courses.find((c) => c.id === courseId);

  const atCap = selectedIds.length >= MAX_PLAYERS;
  const searchActive = query.trim().length > 0;

  // Decorate every player with the number of rounds-together for the
  // sub-label, and exclude the current default (they're already shown
  // pinned as "You").
  const decoratedAll = useMemo(() => {
    return allPlayers
      .filter((p) => p.id !== defaultPlayerId)
      .map((p) => ({
        player: p,
        // Roster ranking signal — recentPlayers is MRU-ordered so we
        // can look up the index for sort order.
        recentIndex: recentPlayers.findIndex((rp) => rp.id === p.id),
      }))
      .sort((a, b) => {
        const ai = a.recentIndex === -1 ? Number.POSITIVE_INFINITY : a.recentIndex;
        const bi = b.recentIndex === -1 ? Number.POSITIVE_INFINITY : b.recentIndex;
        if (ai !== bi) return ai - bi;
        return a.player.nickname.localeCompare(b.player.nickname);
      });
  }, [allPlayers, recentPlayers, defaultPlayerId]);

  const visibleList = useMemo(() => {
    if (!searchActive) return decoratedAll;
    const q = query.trim().toLowerCase();
    return decoratedAll.filter(({ player }) =>
      [player.nickname, player.displayName ?? '', player.handle ?? '']
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q))
    );
  }, [decoratedAll, query, searchActive]);

  function toggleSelected(playerId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(playerId)) {
        if (playerId === defaultPlayerId) return prev; // pinned
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= MAX_PLAYERS) return prev;
      return [...prev, playerId];
    });
    markRecent(playerId);
  }

  function removeSelected(playerId: string) {
    if (playerId === defaultPlayerId) return; // pinned
    setSelectedIds((prev) => prev.filter((id) => id !== playerId));
  }

  function createAndSelectPlayer(rawNickname: string) {
    if (atCap) return;
    const typedName = rawNickname.trim();
    if (typedName.length === 0) return;
    const newId = newPlayerId();
    const color = pickColor(newId);
    const newPlayer: Player = { id: newId, nickname: typedName, color };
    addPlayer(newPlayer);
    setSelectedIds((prev) => [...prev, newId]);
  }

  function handleAddNewPlayer() {
    if (atCap) return;
    const typedName = query.trim();
    if (typedName.length > 0) {
      createAndSelectPlayer(typedName);
      setQuery('');
      return;
    }
    // No search text → ask for a name via the prompt.
    setNamePromptValue('');
    setNamePromptOpen(true);
  }

  function submitNamePrompt() {
    const trimmed = namePromptValue.trim();
    if (trimmed.length === 0) return;
    createAndSelectPlayer(trimmed);
    setNamePromptOpen(false);
    setNamePromptValue('');
  }

  function cancelNamePrompt() {
    setNamePromptOpen(false);
    setNamePromptValue('');
  }

  function handleNext() {
    if (selectedIds.length === 0) return;
    if (!courseId) return;
    router.push({
      // `format` is a new route — the typed-routes generated types are
      // regenerated by Metro on its next file scan; cast keeps tsc clean
      // until that happens. Becomes redundant after the next reload.
      pathname: '/(tabs)/(score)/format' as never,
      params: { courseId, playerIds: selectedIds.join(',') },
    });
  }

  // Resolve a chip's avatar text + color. Linked players surface their
  // live profile color when we have it; otherwise fall back to roster.
  function resolveAvatar(p: Player): { letter: string; color: string } {
    const liveColor = p.userId ? profileCache[p.userId]?.avatarColor : undefined;
    const color = liveColor ?? p.color ?? colors.primary;
    const name = p.displayName ?? p.nickname;
    const letter = name[0]?.toUpperCase() ?? '?';
    return { letter, color };
  }

  return (
    <View style={styles.container}>
      <View style={styles.fixedTop}>
        {course && (
          <Text style={styles.greeting} numberOfLines={1}>
            {course.name}
            {course.location ? ` · ${course.location}` : ''}
          </Text>
        )}
        <Text style={styles.title}>Who&apos;s playing?</Text>

        <View style={[styles.searchBox, searchActive && styles.searchBoxActive]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search players"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {searchActive && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.searchClear}>×</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.chips}>
          {selectedIds.map((id) => {
            const p = getPlayer(id);
            if (!p) return null;
            const isDefault = id === defaultPlayerId;
            const { letter, color } = resolveAvatar(p);
            const label = isDefault
              ? firstName(account?.displayName) || p.displayName || p.nickname || 'You'
              : p.displayName ?? p.nickname;
            return (
              <View key={id} style={[styles.chip, isDefault && styles.chipYou]}>
                <View style={[styles.chipAvatar, { backgroundColor: color }]}>
                  <Text style={styles.chipAvatarText}>{letter}</Text>
                </View>
                <Text style={styles.chipLabel}>{label}</Text>
                {!isDefault && (
                  <Pressable onPress={() => removeSelected(id)} hitSlop={6} style={styles.chipX}>
                    <Text style={styles.chipXText}>×</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {selectedIds.length <= 1 && (
            <Text style={styles.chipsHint}>Tap a player below to add them.</Text>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <Pressable
          style={[
            styles.addRow,
            searchActive && styles.addRowEmphasis,
            atCap && styles.addRowDisabled,
          ]}
          disabled={atCap}
          onPress={handleAddNewPlayer}>
          <View
            style={[
              styles.addAvatar,
              searchActive && styles.addAvatarEmphasis,
              atCap && styles.addAvatarDisabled,
            ]}>
            <Text
              style={[
                styles.addAvatarText,
                searchActive && styles.addAvatarTextEmphasis,
                atCap && styles.addAvatarTextDisabled,
              ]}>
              +
            </Text>
          </View>
          <Text
            style={[
              styles.addRowText,
              searchActive && styles.addRowTextEmphasis,
              atCap && styles.addRowTextDisabled,
            ]}>
            {searchActive ? `Add "${query.trim()}" as a new player` : 'Add new player'}
          </Text>
        </Pressable>

        <Text style={styles.sectionLabel}>
          {searchActive
            ? `SEARCH RESULTS${visibleList.length > 0 ? ` · ${visibleList.length}` : ''}`
            : 'RECENT'}
        </Text>

        {visibleList.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>{searchActive ? '🔭' : '👥'}</Text>
            <Text style={styles.emptyTitle}>
              {searchActive ? `No matches for "${query.trim()}"` : 'No players yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {searchActive
                ? 'Tap "Add" above to add them as a new player — you can link them to a friend later.'
                : 'Use "Add new player" above to start a round with someone, or find friends from the You tab.'}
            </Text>
          </View>
        ) : (
          visibleList.map(({ player }) => {
            const isSelected = selectedIds.includes(player.id);
            const { letter, color } = resolveAvatar(player);
            const isLinked = !!player.userId;
            // Handle resolution mirrors the avatar resolver above:
            // profileCache (canonical, live) wins over the locally-
            // cached roster value, which may be empty even for linked
            // friends.
            const liveHandle = player.userId
              ? profileCache[player.userId]?.handle
              : undefined;
            const handle = liveHandle ?? player.handle;
            const metaLine = handle
              ? `@${handle}`
              : isLinked
              ? 'Friend'
              : 'Local only';
            return (
              <Pressable
                key={player.id}
                onPress={() => toggleSelected(player.id)}
                disabled={!isSelected && atCap}
                style={[
                  styles.player,
                  isSelected && styles.playerSelected,
                  !isSelected && atCap && styles.playerDisabled,
                ]}>
                <View style={[styles.playerAvatar, { backgroundColor: color }]}>
                  <Text style={styles.playerAvatarText}>{letter}</Text>
                  {isSelected && (
                    <View style={styles.checkBadge}>
                      <Text style={styles.checkBadgeText}>✓</Text>
                    </View>
                  )}
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {player.displayName ?? player.nickname}
                  </Text>
                  <Text style={styles.playerMeta} numberOfLines={1}>
                    {metaLine}
                  </Text>
                </View>
                {isLinked && (
                  <View style={[styles.playerBadge, styles.playerBadgeFriend]}>
                    <Text style={[styles.playerBadgeText, styles.playerBadgeFriendText]}>
                      FRIEND
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.nextBtn, selectedIds.length === 0 && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={selectedIds.length === 0}>
          <Text style={styles.nextBtnText}>
            Next
            <Text style={styles.nextBtnCount}>
              {' · '}
              {selectedIds.length === 1
                ? 'Solo round'
                : `${selectedIds.length} players`}
            </Text>
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={namePromptOpen}
        animationType="fade"
        transparent
        onRequestClose={cancelNamePrompt}
        onShow={() => {
          // Defer one frame so the input is mounted before focus.
          setTimeout(() => namePromptInputRef.current?.focus(), 50);
        }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.promptOverlay}>
          <Pressable style={styles.promptBackdrop} onPress={cancelNamePrompt} />
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Add a new player</Text>
            <Text style={styles.promptBody}>
              What&apos;s their name? You can rename or link them to a friend later.
            </Text>
            <TextInput
              ref={namePromptInputRef}
              style={styles.promptInput}
              value={namePromptValue}
              onChangeText={setNamePromptValue}
              placeholder="e.g. Dad, Mike, Sarah"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submitNamePrompt}
              maxLength={40}
            />
            <View style={styles.promptActions}>
              <Pressable style={styles.promptCancel} onPress={cancelNamePrompt}>
                <Text style={styles.promptCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.promptAdd,
                  namePromptValue.trim().length === 0 && styles.promptAddDisabled,
                ]}
                onPress={submitNamePrompt}
                disabled={namePromptValue.trim().length === 0}>
                <Text style={styles.promptAddText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    fixedTop: { paddingHorizontal: 20, paddingTop: 12 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textTitle, marginBottom: 12 },
    greeting: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 10,
    },
    searchBoxActive: { borderColor: colors.primary },
    searchIcon: { fontSize: 13, color: colors.textMuted },
    searchInput: { flex: 1, color: colors.textBody, fontSize: 14, padding: 0 },
    searchClear: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
      paddingHorizontal: 4,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      backgroundColor: colors.chipBg,
      borderRadius: 12,
      padding: 8,
      minHeight: 42,
      alignItems: 'center',
    },
    chipsHint: {
      flex: 1,
      fontSize: 11.5,
      color: colors.textMuted,
      fontStyle: 'italic',
      paddingHorizontal: 4,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingLeft: 4,
      paddingRight: 6,
      paddingVertical: 3,
    },
    chipYou: {
      backgroundColor: '#fff4e3',
      borderColor: '#f5dcb6',
    },
    chipAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipAvatarText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
    chipLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textTitle },
    chipX: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#e0d8c4',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 2,
    },
    chipXText: { fontSize: 11, fontWeight: '800', color: '#6b6b6b' },

    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingTop: 14, paddingBottom: 24 },

    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 8,
      marginLeft: 2,
      marginTop: 10,
    },

    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    addRowEmphasis: {
      borderColor: colors.primary,
      borderStyle: 'solid',
      backgroundColor: 'rgba(124,179,66,0.08)',
    },
    addRowDisabled: { opacity: 0.4 },
    addAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addAvatarEmphasis: { borderColor: colors.primaryDark, borderStyle: 'solid' },
    addAvatarDisabled: {},
    addAvatarText: { fontSize: 16, fontWeight: '800', color: colors.textMuted },
    addAvatarTextEmphasis: { color: colors.primaryDark },
    addAvatarTextDisabled: {},
    addRowText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textMuted },
    addRowTextEmphasis: { color: colors.primaryDark },
    addRowTextDisabled: {},

    player: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      marginBottom: 7,
    },
    playerSelected: {
      borderColor: colors.primary,
      backgroundColor: 'rgba(124,179,66,0.08)',
    },
    playerDisabled: { opacity: 0.4 },
    playerAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    playerAvatarText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
    checkBadge: {
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.primaryDark,
      borderWidth: 1.5,
      borderColor: colors.cardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkBadgeText: { color: '#ffffff', fontSize: 8, fontWeight: '800' },
    playerInfo: { flex: 1, minWidth: 0 },
    playerName: { fontSize: 13, fontWeight: '800', color: colors.textTitle },
    playerMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
    playerBadge: {
      borderRadius: 5,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    playerBadgeFriend: { backgroundColor: 'rgba(124,179,66,0.18)' },
    playerBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
    playerBadgeFriendText: { color: colors.primaryDark },

    emptyWrap: {
      alignItems: 'center',
      paddingTop: 24,
      paddingBottom: 12,
      paddingHorizontal: 20,
      gap: 4,
    },
    emptyIcon: { fontSize: 32, opacity: 0.5, marginBottom: 4 },
    emptyTitle: { fontSize: 13, fontWeight: '800', color: colors.textTitle, textAlign: 'center' },
    emptyBody: {
      fontSize: 11.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 17,
      maxWidth: 260,
    },

    footer: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 20,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    nextBtn: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 22,
      paddingVertical: 14,
    },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    nextBtnCount: { fontWeight: '700', opacity: 0.9, fontSize: 12 },

    // Name-prompt modal
    promptOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    promptBackdrop: { ...StyleSheet.absoluteFillObject },
    promptCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 18,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    promptTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 4,
    },
    promptBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      lineHeight: 18,
      marginBottom: 14,
    },
    promptInput: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textBody,
      marginBottom: 14,
    },
    promptActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
    },
    promptCancel: {
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    promptCancelText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    promptAdd: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    promptAddDisabled: { opacity: 0.4 },
    promptAddText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#ffffff',
    },
  });
}
