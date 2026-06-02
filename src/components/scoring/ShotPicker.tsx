/**
 * ShotPicker — scramble shot attribution editor. One pill per
 * stroke (length = team's current stroke count for the hole); each
 * pill is pressable and opens a member-picker bottom sheet.
 *
 * Visual: numbered circle on the left, avatar + name on the right
 * with a caret. Unattributed strokes render a dashed placeholder
 * (no avatar / "—" label) so the user can see how many shots are
 * pending attribution.
 *
 * Per Q6: the first pill is the tee shot (used by aggregate summary
 * computations).
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from './TeamAvatarCluster';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  /** Total stroke count for the team on this hole. Drives pill count. */
  strokeCount: number;
  /** Current contributor list. Length may differ from strokeCount; we truncate/pad. */
  contributorIds: readonly string[];
  /** Team members the picker can choose from. */
  members: readonly AvatarMember[];
  /** Called with a new contributor list (always length === strokeCount). */
  onChange: (next: readonly string[]) => void;
};

export function ShotPicker({
  strokeCount,
  contributorIds,
  members,
  onChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Normalise to exactly `strokeCount` slots. Truncate when longer;
  // pad with empty string when shorter.
  const normalised = useMemo(() => {
    const out = new Array<string>(Math.max(0, strokeCount));
    for (let i = 0; i < out.length; i++) {
      out[i] = contributorIds[i] ?? '';
    }
    return out;
  }, [strokeCount, contributorIds]);

  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  function pick(memberKey: string) {
    if (pickerIndex == null) return;
    const next = [...normalised];
    next[pickerIndex] = memberKey;
    setPickerIndex(null);
    onChange(next);
  }

  if (strokeCount <= 0) return null;

  return (
    <>
      <View style={styles.row}>
        {normalised.map((key, i) => {
          const member = members.find((m) => m.id === key) ?? null;
          const isEmpty = !member;
          return (
            <Pressable
              key={`shot-${i}`}
              style={[styles.pill, isEmpty ? styles.pillEmpty : null]}
              onPress={() => setPickerIndex(i)}
              accessibilityRole="button"
              accessibilityLabel={
                member
                  ? `Shot ${i + 1}: ${member.name}. Tap to change.`
                  : `Shot ${i + 1} unattributed. Tap to pick a member.`
              }>
              <View
                style={[styles.shotNum, isEmpty ? styles.shotNumEmpty : null]}>
                <Text
                  style={[
                    styles.shotNumText,
                    isEmpty ? styles.shotNumTextEmpty : null,
                  ]}>
                  {i + 1}
                </Text>
              </View>
              {member ? (
                <>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: member.color },
                    ]}>
                    <Text style={styles.avatarText}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.label} numberOfLines={1}>
                    {member.name.split(' ')[0]}
                  </Text>
                </>
              ) : (
                <Text style={[styles.label, styles.labelEmpty]}>—</Text>
              )}
              <Text style={styles.caret}>▾</Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={pickerIndex != null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerIndex(null)}>
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setPickerIndex(null)}
            accessibilityLabel="Dismiss member picker"
          />
          <View style={styles.sheet}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>
            <View style={styles.head}>
              <Text style={styles.title}>
                Shot {pickerIndex != null ? pickerIndex + 1 : ''}
              </Text>
              <Pressable
                style={styles.close}
                onPress={() => setPickerIndex(null)}
                accessibilityRole="button"
                accessibilityLabel="Close member picker">
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            {members.map((member) => {
              const isActive =
                pickerIndex != null && normalised[pickerIndex] === member.id;
              return (
                <Pressable
                  key={member.id}
                  style={[styles.memberRow, isActive ? styles.memberRowActive : null]}
                  onPress={() => pick(member.id)}>
                  <TeamAvatarCluster members={[member]} size="md" />
                  <Text
                    style={[
                      styles.memberLabel,
                      isActive ? styles.memberLabelActive : null,
                    ]}
                    numberOfLines={1}>
                    {member.name}
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
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingLeft: 3,
      paddingRight: 9,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
    },
    pillEmpty: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    shotNum: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBg,
    },
    shotNumEmpty: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    shotNumText: {
      fontSize: 9.5,
      fontWeight: '900',
      color: colors.textMuted,
    },
    shotNumTextEmpty: {
      color: colors.textMuted,
    },
    avatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '900',
    },
    label: {
      fontSize: 11.5,
      fontWeight: '800',
      color: colors.textTitle,
    },
    labelEmpty: {
      color: colors.textMuted,
      fontWeight: '700',
    },
    caret: {
      fontSize: 10,
      color: colors.textMuted,
      marginLeft: 1,
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
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    memberRowActive: {
      backgroundColor: 'rgba(47,125,75,0.10)',
    },
    memberLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    memberLabelActive: {
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
