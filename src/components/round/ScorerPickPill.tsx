/**
 * ScorerPickPill — small avatar + name pill with a caret that opens
 * a bottom-sheet picker for swapping which scorer's hole the user is
 * viewing on the feed Holes tab.
 *
 * Used only in read-only mode (feed). The scoring surface doesn't
 * need this pill because each scorer gets their own entry block per
 * the mockup.
 *
 * Members array reflects the scorer's avatar cluster (single avatar
 * for stroke, overlapping team avatars for scramble), matching the
 * pattern in `SummaryTabContent` + `HorizontalScorecard`.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type ScorerPickOption = {
  /** Stable scorerId (participantKey or teamId). */
  id: string;
  /** Display label for the pill + sheet rows. */
  label: string;
  members: AvatarMember[];
};

type Props = {
  selectedId: string | null;
  options: readonly ScorerPickOption[];
  onChange: (id: string) => void;
};

export function ScorerPickPill({ selectedId, options, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.id === selectedId) ?? options[0];
  if (!selected) return null;

  function pick(id: string) {
    setOpen(false);
    if (id !== selected.id) onChange(id);
  }

  return (
    <>
      <Pressable
        style={styles.pill}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Viewing ${selected.label}. Tap to switch scorer.`}>
        <TeamAvatarCluster members={selected.members} size="sm" />
        <Text style={styles.label} numberOfLines={1}>
          {selected.label}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
            accessibilityLabel="Dismiss scorer picker"
          />
          <View style={styles.sheet}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>
            <View style={styles.head}>
              <Text style={styles.title}>Switch scorer</Text>
              <Pressable
                style={styles.close}
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close scorer picker">
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            {options.map((opt) => {
              const isActive = opt.id === selected.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.row, isActive ? styles.rowActive : null]}
                  onPress={() => pick(opt.id)}>
                  <TeamAvatarCluster members={opt.members} size="md" />
                  <Text
                    style={[
                      styles.rowLabel,
                      isActive ? styles.rowLabelActive : null,
                    ]}
                    numberOfLines={1}>
                    {opt.label}
                  </Text>
                  {isActive ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 6,
      paddingRight: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
      alignSelf: 'flex-start',
    },
    label: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.textTitle,
      maxWidth: 160,
    },
    caret: {
      fontSize: 10,
      color: colors.textMuted,
    },
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.32)',
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingBottom: 24,
      maxHeight: '85%',
    },
    handleWrap: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 6,
    },
    handle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    title: {
      fontSize: 16,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.2,
    },
    close: {
      marginLeft: 'auto',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    closeText: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    rowActive: {
      backgroundColor: 'rgba(47,125,75,0.10)',
    },
    rowLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    rowLabelActive: {
      color: colors.primaryDark,
      fontWeight: '900',
    },
    check: {
      fontSize: 14,
      fontWeight: '900',
      color: colors.primaryDark,
    },
  });
}
