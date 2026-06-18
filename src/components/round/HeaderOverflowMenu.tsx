/**
 * HeaderOverflowMenu — a `⋯` button for a native stack header's
 * `headerRight`, opening a small popover anchored to the top-right
 * with one or more actions (typically a single destructive item).
 *
 * Used by the editing screens for the rare, destructive round-ending
 * action that the redesign moves out of the primary tap zone:
 * Abandon round (live scoring) / Delete round (completed-round edit).
 *
 * The popover is an RN `Modal` overlay so it renders above the header
 * regardless of the header's own clipping; it's positioned just below
 * the header using the top safe-area inset.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type OverflowItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  items: OverflowItem[];
  /** Tint for the `⋯` glyph; defaults to the title colour. */
  tintColor?: string;
};

export function HeaderOverflowMenu({ items, tintColor }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="More options"
        style={styles.trigger}>
        <Ionicons
          name="ellipsis-horizontal"
          size={22}
          color={tintColor ?? colors.textTitle}
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close menu"
        />
        <View style={[styles.menu, { top: insets.top + 48 }]}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              style={styles.item}
              onPress={() => {
                setOpen(false);
                item.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}>
              {item.icon ? (
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.destructive ? colors.accent : colors.textTitle}
                />
              ) : null}
              <Text
                style={[
                  styles.itemLabel,
                  item.destructive ? styles.itemLabelDestructive : null,
                ]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    trigger: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginRight: 2,
      borderRadius: 999,
      backgroundColor: colors.glassFill,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    menu: {
      position: 'absolute',
      right: 10,
      minWidth: 184,
      backgroundColor: colors.glassFill2,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      padding: 6,
      shadowColor: colors.lime,
      shadowOpacity: 0.18,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 24,
      elevation: 9,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 11,
      paddingVertical: 11,
      borderRadius: 12,
    },
    itemLabel: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.textTitle,
    },
    itemLabelDestructive: {
      color: colors.accent,
    },
  });
}
