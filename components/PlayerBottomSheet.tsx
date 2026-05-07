/**
 * Bottom sheet modal for searching/creating players to add to a round.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';

import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Player } from '@/types/golf';

const PLAYER_COLORS = ['#42a5f5', '#ab47bc', '#ff8f00', '#26a69a', '#ef5350', '#7cb342'];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectPlayer: (player: Player) => void;
  excludeIds: string[];
  /** When true the roster is full; the sheet hides its add/create affordances. */
  atCap?: boolean;
};

export function PlayerBottomSheet({ visible, onClose, onSelectPlayer, excludeIds, atCap }: Props) {
  const { allPlayers, addPlayer } = usePlayers();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);

  const filteredPlayers = allPlayers.filter(
    (p) =>
      !excludeIds.includes(p.id) &&
      p.nickname.toLowerCase().includes(search.toLowerCase())
  );

  function handleCreate() {
    if (!newName.trim()) return;
    const player: Player = {
      id: `player-${Date.now()}`,
      nickname: newName.trim(),
      color: selectedColor,
    };
    addPlayer(player);
    onSelectPlayer(player);
    resetState();
  }

  function resetState() {
    setSearch('');
    setCreating(false);
    setNewName('');
    setSelectedColor(PLAYER_COLORS[0]);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add Player</Text>

          {!creating ? (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Search players..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />

              <ScrollView style={styles.list}>
                {filteredPlayers.map((player) => (
                  <Pressable
                    key={player.id}
                    style={[styles.playerRow, atCap && styles.disabledRow]}
                    onPress={() => {
                      if (atCap) return;
                      onSelectPlayer(player);
                      resetState();
                    }}
                    disabled={atCap}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: player.color || colors.primary },
                      ]}>
                      <Text style={styles.avatarText}>{player.nickname[0]}</Text>
                    </View>
                    <Text style={styles.playerName}>{player.nickname}</Text>
                    {!atCap && <Text style={styles.addGlyph}>+</Text>}
                  </Pressable>
                ))}
                {filteredPlayers.length === 0 && (
                  <Text style={styles.emptyText}>
                    {atCap ? 'Roster is full (max 4 players).' : 'No players found.'}
                  </Text>
                )}
              </ScrollView>

              {!atCap && (
                <Pressable style={styles.createBtn} onPress={() => setCreating(true)}>
                  <Text style={styles.createBtnText}>+ Create New Player</Text>
                </Pressable>
              )}
            </>
          ) : (
            <View style={styles.createForm}>
              <Text style={styles.formLabel}>Player Name</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Enter name"
                placeholderTextColor={colors.textMuted}
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />

              <Text style={styles.formLabel}>Color</Text>
              <View style={styles.colorRow}>
                {PLAYER_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      selectedColor === color && styles.selectedSwatch,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.formActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setCreating(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmBtn, !newName.trim() && styles.disabledBtn]}
                  onPress={handleCreate}
                  disabled={!newName.trim()}>
                  <Text style={styles.confirmBtnText}>Add to Round</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingBottom: 34,
      paddingTop: 12,
      maxHeight: '70%',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 16,
    },
    searchInput: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.textBody,
      fontSize: 16,
      padding: 14,
      marginBottom: 12,
    },
    list: {
      maxHeight: 220,
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    disabledRow: {
      opacity: 0.4,
    },
    addGlyph: {
      marginLeft: 'auto',
      color: colors.primary,
      fontSize: 22,
      fontWeight: '700',
      paddingHorizontal: 8,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
    playerName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textTitle,
      marginLeft: 12,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: 20,
    },
    createBtn: {
      alignItems: 'center',
      borderColor: colors.primary,
      borderRadius: 12,
      borderWidth: 1.5,
      padding: 14,
      marginTop: 12,
    },
    createBtnText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    createForm: {
      paddingTop: 4,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
      marginBottom: 8,
      marginTop: 12,
    },
    colorRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
    },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    selectedSwatch: {
      borderWidth: 3,
      borderColor: colors.textTitle,
    },
    formActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1.5,
      paddingVertical: 14,
    },
    cancelBtnText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
    confirmBtn: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
    },
    disabledBtn: {
      opacity: 0.4,
    },
    confirmBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
