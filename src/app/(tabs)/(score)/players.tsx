/**
 * Player Selection — Step 1 of the Score-tab round-setup flow.
 *
 * Two real sources replace the prior `SEED_PLAYERS` roster:
 *
 *   · Friends — userIds from `useFriends()` resolved via
 *     `useParticipantResolver`. Same source the Home banner / Friends
 *     UI uses, so a brand-new friendship surfaces here within a
 *     PowerSync sync tick.
 *
 *   · Custom players — user-scoped roster of off-app people the user
 *     plays rounds with. Created inline from this picker (search-as-
 *     you-type "Add 'X' as a new player" affordance, plus a modal
 *     name prompt). 3-dot context menu on each custom row offers
 *     soft-delete; deleted rows vanish from the picker but stay
 *     synced so historic scorecards keep rendering correctly.
 *
 * The pinned "You" chip is sourced from `useRequiredAccount()`.
 *
 * participantKey format (see `participantKey.ts`):
 *   self / friend  →  `user:{userId}`
 *   custom         →  `custom:{customPlayerId}`
 *
 * Footer "Next" pushes `/(score)/format` with the comma-joined
 * prefixed keys as `playerIds`. The format + scoring screens
 * resolve them via `useParticipantResolver`.
 *
 * Redirect gate: bounces to `/scoring` when a round is already in
 * flight, like the index screen.
 */

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SEED_COURSES } from '@/data/courses';
import {
  createCustomPlayer,
  softDeleteCustomPlayer,
} from '@/library/golf/customPlayers';
import {
  customParticipantKey,
  userParticipantKey,
} from '@/library/golf/participantKey';
import { useRound } from '@/library/golf/RoundContext';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import {
  CUSTOM_PLAYERS_TABLE,
  type CustomPlayerRecord,
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import { confirmAsync, showAlert } from '@/library/utils/alert';
import { useQuery } from '@powersync/react';

const MAX_PLAYERS = 4;

type CustomPlayerRow = CustomPlayerRecord & { id: string };

type FriendEntry = { kind: 'friend'; participantKey: string; userId: string };
type CustomEntry = {
  kind: 'custom';
  participantKey: string;
  customPlayerId: string;
};
type ListEntry = FriendEntry | CustomEntry;

export default function PlayersScreen() {
  const { colors } = useTheme();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const { currentRound, roundHydrated } = useRound();
  const account = useRequiredAccount();
  const { friends } = useFriends();
  const system = useSystem();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const selfKey = useMemo(
    () => userParticipantKey(account.userId),
    [account.userId]
  );

  // Custom players for this user (active only — soft-deleted rows
  // stay synced for the scorecard resolver but are hidden here).
  const { data: customRows } = useQuery<CustomPlayerRow>(
    `SELECT id, nickname, avatar_color, deleted_at
       FROM ${CUSTOM_PLAYERS_TABLE}
       WHERE owner_user_id = ? AND deleted_at IS NULL`,
    [account.userId]
  );

  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => [selfKey]);
  const [query, setQuery] = useState('');
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [namePromptValue, setNamePromptValue] = useState('');
  const namePromptInputRef = useRef<TextInput | null>(null);
  const [menuTarget, setMenuTarget] = useState<{
    id: string;
    anchor: { x: number; y: number; width: number };
  } | null>(null);

  // List of participantKeys we need to resolve display info for.
  // Includes self + friends + custom + any currently-selected key
  // that isn't in friends/customs (defensive for late re-renders).
  const resolverKeys = useMemo(() => {
    const set = new Set<string>([selfKey]);
    for (const uid of friends) set.add(userParticipantKey(uid));
    for (const c of customRows) set.add(customParticipantKey(c.id));
    for (const k of selectedKeys) set.add(k);
    return Array.from(set);
  }, [selfKey, friends, customRows, selectedKeys]);
  const resolver = useParticipantResolver(resolverKeys);

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

  const course = SEED_COURSES.find((c) => c.id === courseId);
  const atCap = selectedKeys.length >= MAX_PLAYERS;
  const trimmedQuery = query.trim();
  const searchActive = trimmedQuery.length > 0;

  // ------------------------------------------------------------------
  // List composition — friends + custom, alphabetical within each
  // bucket, with the search filter applied across name/handle.
  // ------------------------------------------------------------------

  const friendEntries: FriendEntry[] = friends.map((uid) => ({
    kind: 'friend',
    participantKey: userParticipantKey(uid),
    userId: uid,
  }));
  const customEntries: CustomEntry[] = customRows.map((c) => ({
    kind: 'custom',
    participantKey: customParticipantKey(c.id),
    customPlayerId: c.id,
  }));

  function matchesSearch(entry: ListEntry): boolean {
    if (!searchActive) return true;
    const q = trimmedQuery.toLowerCase();
    const resolved = resolver.get(entry.participantKey);
    if (!resolved) return false;
    if (resolved.displayName?.toLowerCase().includes(q)) return true;
    if (resolved.handle && resolved.handle.toLowerCase().includes(q)) return true;
    return false;
  }

  function nameOf(entry: ListEntry): string {
    return resolver.get(entry.participantKey)?.displayName || '';
  }

  const visibleFriends = friendEntries
    .filter(matchesSearch)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const visibleCustoms = customEntries
    .filter(matchesSearch)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  // ------------------------------------------------------------------
  // Selection
  // ------------------------------------------------------------------

  function toggleSelected(participantKey: string) {
    setSelectedKeys((prev) => {
      if (participantKey === selfKey) return prev; // pinned
      if (prev.includes(participantKey)) {
        return prev.filter((k) => k !== participantKey);
      }
      if (prev.length >= MAX_PLAYERS) return prev;
      return [...prev, participantKey];
    });
  }

  function removeSelected(participantKey: string) {
    if (participantKey === selfKey) return;
    setSelectedKeys((prev) => prev.filter((k) => k !== participantKey));
  }

  // ------------------------------------------------------------------
  // Custom-player create / delete
  // ------------------------------------------------------------------

  async function createAndSelect(rawNickname: string) {
    if (atCap) return;
    const nickname = rawNickname.trim();
    if (nickname.length === 0) return;
    try {
      const created = await createCustomPlayer(system, account.userId, nickname);
      const key = customParticipantKey(created.id);
      setSelectedKeys((prev) =>
        prev.includes(key) || prev.length >= MAX_PLAYERS ? prev : [...prev, key]
      );
    } catch (err: any) {
      showAlert(
        'Could not add player',
        err?.message ?? 'Something went wrong. Try again.'
      );
    }
  }

  function handleAddRowPress() {
    if (atCap) return;
    if (searchActive) {
      void createAndSelect(trimmedQuery);
      setQuery('');
      return;
    }
    setNamePromptValue('');
    setNamePromptOpen(true);
  }

  function submitNamePrompt() {
    const value = namePromptValue.trim();
    if (value.length === 0) return;
    void createAndSelect(value);
    setNamePromptOpen(false);
    setNamePromptValue('');
  }

  function cancelNamePrompt() {
    setNamePromptOpen(false);
    setNamePromptValue('');
  }

  async function handleDeleteCustom(customPlayerId: string) {
    setMenuTarget(null);
    const ok = await confirmAsync(
      'Delete custom player?',
      "They'll disappear from your picker but still show up correctly on rounds you've already scored."
    );
    if (!ok) return;
    try {
      await softDeleteCustomPlayer(system, customPlayerId);
      // Drop them from the current selection too.
      setSelectedKeys((prev) =>
        prev.filter((k) => k !== customParticipantKey(customPlayerId))
      );
    } catch (err: any) {
      showAlert(
        'Could not delete player',
        err?.message ?? 'Something went wrong. Try again.'
      );
    }
  }

  // ------------------------------------------------------------------
  // Footer
  // ------------------------------------------------------------------

  function handleNext() {
    if (!courseId || selectedKeys.length === 0) return;
    router.push({
      pathname: '/(tabs)/(score)/format' as never,
      params: { courseId, playerIds: selectedKeys.join(',') },
    });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const emptyVisible =
    !searchActive && visibleFriends.length === 0 && visibleCustoms.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textTitle} />
          <Text style={styles.backText}>Course</Text>
        </Pressable>
      </View>

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
            placeholder="Search friends or custom players"
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
          {selectedKeys.map((key) => {
            const isSelf = key === selfKey;
            const resolved = resolver.get(key);
            const name = isSelf
              ? account.displayName || 'You'
              : resolved?.displayName || 'Player';
            const color = isSelf
              ? account.avatarColor
              : resolved?.avatarColor || colors.primary;
            const letter = (name[0] ?? '?').toUpperCase();
            return (
              <View
                key={key}
                style={[styles.chip, isSelf && styles.chipYou]}>
                <View style={[styles.chipAvatar, { backgroundColor: color }]}>
                  <Text style={styles.chipAvatarText}>{letter}</Text>
                </View>
                <Text style={styles.chipLabel}>{name}</Text>
                {!isSelf && (
                  <Pressable
                    onPress={() => removeSelected(key)}
                    hitSlop={6}
                    style={styles.chipX}>
                    <Text style={styles.chipXText}>×</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {selectedKeys.length <= 1 && (
            <Text style={styles.chipsHint}>Tap a row below to add them.</Text>
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
          onPress={handleAddRowPress}>
          <View
            style={[
              styles.addAvatar,
              searchActive && styles.addAvatarEmphasis,
            ]}>
            <Text
              style={[
                styles.addAvatarText,
                searchActive && styles.addAvatarTextEmphasis,
              ]}>
              +
            </Text>
          </View>
          <Text
            style={[
              styles.addRowText,
              searchActive && styles.addRowTextEmphasis,
            ]}>
            {searchActive
              ? `Add "${trimmedQuery}" as a new player`
              : 'Add new player'}
          </Text>
        </Pressable>

        {visibleFriends.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>FRIENDS</Text>
            {visibleFriends.map((entry) => (
              <PlayerRowFriend
                key={entry.participantKey}
                entry={entry}
                resolver={resolver}
                selected={selectedKeys.includes(entry.participantKey)}
                atCap={atCap}
                onToggle={() => toggleSelected(entry.participantKey)}
                styles={styles}
                colors={colors}
              />
            ))}
          </>
        )}

        {visibleCustoms.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>CUSTOM PLAYERS</Text>
            {visibleCustoms.map((entry) => (
              <PlayerRowCustom
                key={entry.participantKey}
                entry={entry}
                resolver={resolver}
                selected={selectedKeys.includes(entry.participantKey)}
                atCap={atCap}
                onToggle={() => toggleSelected(entry.participantKey)}
                onOpenMenu={(anchor) =>
                  setMenuTarget({ id: entry.customPlayerId, anchor })
                }
                styles={styles}
                colors={colors}
              />
            ))}
          </>
        )}

        {emptyVisible && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No friends or custom players yet</Text>
            <Text style={styles.emptyBody}>
              Use &quot;Add new player&quot; above to score for someone off-app,
              or open the Search tab to friend someone with an account.
            </Text>
          </View>
        )}

        {searchActive && visibleFriends.length === 0 && visibleCustoms.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🔭</Text>
            <Text style={styles.emptyTitle}>
              No matches for &quot;{trimmedQuery}&quot;
            </Text>
            <Text style={styles.emptyBody}>
              Tap &quot;Add&quot; above to add them as a custom player.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.nextBtn,
            (selectedKeys.length === 0 || !courseId) && styles.nextBtnDisabled,
          ]}
          disabled={selectedKeys.length === 0 || !courseId}
          onPress={handleNext}>
          <Text style={styles.nextBtnText}>
            Next
            <Text style={styles.nextBtnCount}>
              {' · '}
              {selectedKeys.length === 1
                ? 'Solo round'
                : `${selectedKeys.length} players`}
            </Text>
          </Text>
        </Pressable>
      </View>

      {/* Name prompt modal — opened when the user taps "Add new player"
          without a search query active. */}
      <Modal
        visible={namePromptOpen}
        animationType="fade"
        transparent
        onRequestClose={cancelNamePrompt}
        onShow={() => {
          setTimeout(() => namePromptInputRef.current?.focus(), 50);
        }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.promptOverlay}>
          <Pressable style={styles.promptBackdrop} onPress={cancelNamePrompt} />
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Add a custom player</Text>
            <Text style={styles.promptBody}>
              What&apos;s their name? You can score for them in rounds without
              them having an account.
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

      {/* 3-dot context menu — anchored under the tapped row's dots. */}
      <Modal
        visible={menuTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuTarget(null)}>
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuTarget(null)}>
          {menuTarget && (
            <View
              onStartShouldSetResponder={() => true}
              style={[
                styles.menuPopover,
                {
                  top: menuTarget.anchor.y + 28,
                  left: Math.max(8, menuTarget.anchor.x - 140),
                },
              ]}>
              <Pressable
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed,
                ]}
                onPress={() => void handleDeleteCustom(menuTarget.id)}>
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                  Delete
                </Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------
// Row components — split so each call site doesn't need to know the
// "is this a friend or a custom" branch.
// ---------------------------------------------------------------------

type RowStyles = ReturnType<typeof makeStyles>;

function PlayerRowFriend({
  entry,
  resolver,
  selected,
  atCap,
  onToggle,
  styles,
  colors,
}: {
  entry: FriendEntry;
  resolver: ReturnType<typeof useParticipantResolver>;
  selected: boolean;
  atCap: boolean;
  onToggle: () => void;
  styles: RowStyles;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const resolved = resolver.get(entry.participantKey);
  const name = resolved?.displayName || 'Player';
  const color = resolved?.avatarColor || colors.primary;
  const handle = resolved?.handle;
  const letter = (name[0] ?? '?').toUpperCase();
  return (
    <Pressable
      onPress={onToggle}
      disabled={!selected && atCap}
      style={[
        styles.player,
        selected && styles.playerSelected,
        !selected && atCap && styles.playerDisabled,
      ]}>
      <View style={[styles.playerAvatar, { backgroundColor: color }]}>
        <Text style={styles.playerAvatarText}>{letter}</Text>
        {selected && (
          <View style={styles.checkBadge}>
            <Text style={styles.checkBadgeText}>✓</Text>
          </View>
        )}
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.playerMeta} numberOfLines={1}>
          {handle ? `@${handle}` : 'Friend'}
        </Text>
      </View>
      <View style={[styles.playerBadge, styles.playerBadgeFriend]}>
        <Text style={[styles.playerBadgeText, styles.playerBadgeFriendText]}>
          FRIEND
        </Text>
      </View>
    </Pressable>
  );
}

function PlayerRowCustom({
  entry,
  resolver,
  selected,
  atCap,
  onToggle,
  onOpenMenu,
  styles,
  colors,
}: {
  entry: CustomEntry;
  resolver: ReturnType<typeof useParticipantResolver>;
  selected: boolean;
  atCap: boolean;
  onToggle: () => void;
  onOpenMenu: (anchor: { x: number; y: number; width: number }) => void;
  styles: RowStyles;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const resolved = resolver.get(entry.participantKey);
  const name = resolved?.displayName || 'Player';
  const color = resolved?.avatarColor || colors.primary;
  const letter = (name[0] ?? '?').toUpperCase();
  const dotsRef = useRef<View>(null);

  const openMenu = useCallback(() => {
    const node = dotsRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width) => {
      onOpenMenu({ x, y, width });
    });
  }, [onOpenMenu]);

  const onDotsLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      // No-op; measurement happens lazily on press.
    },
    []
  );

  return (
    <Pressable
      onPress={onToggle}
      disabled={!selected && atCap}
      style={[
        styles.player,
        selected && styles.playerSelected,
        !selected && atCap && styles.playerDisabled,
      ]}>
      <View style={[styles.playerAvatar, { backgroundColor: color }]}>
        <Text style={styles.playerAvatarText}>{letter}</Text>
        {selected && (
          <View style={styles.checkBadge}>
            <Text style={styles.checkBadgeText}>✓</Text>
          </View>
        )}
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.playerMeta} numberOfLines={1}>
          Custom
        </Text>
      </View>
      <Pressable
        ref={dotsRef}
        onLayout={onDotsLayout}
        onPress={(e) => {
          // Stop the outer row's onPress from firing (would toggle
          // selection on the same tap).
          e.stopPropagation();
          openMenu();
        }}
        hitSlop={8}
        style={styles.dotsBtn}>
        <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerRow: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 4,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingRight: 8,
    },
    backText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    fixedTop: { paddingHorizontal: 20, paddingTop: 4 },
    greeting: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
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
      borderColor: colors.primary,
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
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 2,
    },
    chipXText: { fontSize: 11, fontWeight: '800', color: colors.textMuted },

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
      marginBottom: 6,
    },
    addRowEmphasis: {
      borderColor: colors.primary,
      borderStyle: 'solid',
      backgroundColor: colors.chipBg,
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
    addAvatarEmphasis: {
      borderColor: colors.primaryDark,
      borderStyle: 'solid',
    },
    addAvatarText: { fontSize: 16, fontWeight: '800', color: colors.textMuted },
    addAvatarTextEmphasis: { color: colors.primaryDark },
    addRowText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    addRowTextEmphasis: { color: colors.primaryDark },

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
      backgroundColor: colors.chipBg,
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
    playerMeta: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
      fontWeight: '600',
    },
    playerBadge: {
      borderRadius: 5,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    playerBadgeFriend: { backgroundColor: colors.chipBg },
    playerBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
    playerBadgeFriendText: { color: colors.primaryDark },
    dotsBtn: {
      padding: 4,
    },

    emptyWrap: {
      alignItems: 'center',
      paddingTop: 24,
      paddingBottom: 12,
      paddingHorizontal: 20,
      gap: 4,
    },
    emptyIcon: { fontSize: 32, opacity: 0.5, marginBottom: 4 },
    emptyTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 11.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 17,
      maxWidth: 280,
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
    promptBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    promptCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    promptTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 6,
    },
    promptBody: {
      fontSize: 12,
      color: colors.textBody,
      marginBottom: 12,
      lineHeight: 17,
    },
    promptInput: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textTitle,
      marginBottom: 12,
    },
    promptActions: { flexDirection: 'row', gap: 8 },
    promptCancel: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    promptCancelText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textBody,
    },
    promptAdd: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    promptAddDisabled: { opacity: 0.5 },
    promptAddText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#ffffff',
    },

    // 3-dot context menu
    menuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.001)',
    },
    menuPopover: {
      position: 'absolute',
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 6,
      minWidth: 160,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 6,
    },
    menuItem: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 6,
    },
    menuItemPressed: { backgroundColor: colors.chipBg },
    menuItemText: {
      fontSize: 13,
      fontWeight: '700',
    },
    menuItemTextDanger: { color: colors.accent },
  });
}
