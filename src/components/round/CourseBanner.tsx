/**
 * CourseBanner — the round header row.
 *
 * A compact, social-app header (mockup `feed-card-header-redesign.html`):
 *
 *   [avatar]  @handle                         ⋯
 *             Course Name · 2h ago
 *
 * The owner's avatar (deterministic colour + initial) and @handle link to
 * their profile via `onPressOwner` (the caller routes within its own tab
 * stack). The course name sits beneath; course location is intentionally
 * dropped. For live rounds the time means "last updated" and renders in the
 * live colour with a small pulsing dot.
 *
 * A ⋯ overflow (right, vertically centred) opens an anchored popover with
 * round actions — same look as `HeaderOverflowMenu`, anchored to the
 * button's measured position since a card sits anywhere in the scroll. It
 * is rendered only when `overflowActions` is non-empty (e.g. the scoring
 * screen passes none — its actions live in the native stack header).
 *
 * Shared by every round surface: `RoundListCard` (feed + Previous list),
 * `RoundDetailView` (detail screen) and `ScoringRoundView` (scoring + edit).
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '@/components/aurora';
import { pickAvatarColor } from '@/library/social/avatarColors';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import type { OverflowItem } from './HeaderOverflowMenu';
import { LiveStatusChip } from './LiveStatusChip';

type Props = {
  /** Round owner's @handle (without the leading @). */
  handle?: string | null;
  /** Fallback title + avatar initial when no handle is known. */
  displayName?: string | null;
  /** Owner avatar colour; falls back to a hash of `avatarSeed`. */
  avatarColor?: string | null;
  /** Seed for the avatar-colour fallback (the owner's userId). */
  avatarSeed?: string | null;
  /** Course name (no location). */
  courseName: string;
  /**
   * Optional subline override. When set, this replaces the course name
   * in the meta row (the feed card passes a round descriptor here and
   * surfaces the course name in the card body instead). Other surfaces
   * leave it undefined and the course name shows in the meta row.
   */
  subtitle?: string | null;
  /** Relative time, e.g. "2h ago" (completed) or last-updated (live). */
  timeText: string;
  /** Live rounds render the time in the live colour with a pulsing dot. */
  isLive?: boolean;
  /** Avatar + @handle tap → owner profile (routed by the caller). */
  onPressOwner?: () => void;
  /** When non-empty, a ⋯ opens an anchored popover with these actions. */
  overflowActions?: OverflowItem[];
};

export function CourseBanner({
  handle,
  displayName,
  avatarColor,
  avatarSeed,
  courseName,
  subtitle,
  timeText,
  isLive = false,
  onPressOwner,
  overflowActions,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const title = handle ? `@${handle}` : displayName || 'Someone';
  const initial = (
    displayName?.trim()?.[0] ??
    handle?.trim()?.[0] ??
    '?'
  ).toUpperCase();
  const avatarBg =
    avatarColor || pickAvatarColor(avatarSeed || handle || displayName || '?');
  const profileLabel = handle ? `View ${handle}'s profile` : 'View profile';

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onPressOwner}
        disabled={!onPressOwner}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={profileLabel}>
        <Avatar initial={initial} color={avatarBg} circle size={44} />
      </Pressable>

      <View style={styles.textCol}>
        <Pressable
          onPress={onPressOwner}
          disabled={!onPressOwner}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={profileLabel}>
          <Text style={styles.handle} numberOfLines={1}>
            {title}
          </Text>
        </Pressable>
        <View style={styles.subRow}>
          {/* TODO(course-screen): make the course name tappable
              (push course/[id]) once that route exists. */}
          {subtitle ? (
            <Text style={styles.course} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : (
            <>
              <Text style={styles.course} numberOfLines={1}>
                {courseName}
              </Text>
              <Text style={styles.sep}> · </Text>
              <Text
                style={isLive ? styles.liveTime : styles.metaTime}
                numberOfLines={1}>
                {timeText}
              </Text>
            </>
          )}
        </View>
      </View>

      {isLive || (overflowActions && overflowActions.length > 0) ? (
        <View style={styles.rightSlot}>
          {isLive ? <LiveStatusChip /> : null}
          {overflowActions && overflowActions.length > 0 ? (
            <BannerOverflowMenu items={overflowActions} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Anchored ⋯ overflow popover — HeaderOverflowMenu look, positioned    */
/* under the measured button (FriendActionPill measureInWindow style).  */
/* ------------------------------------------------------------------ */

function BannerOverflowMenu({ items }: { items: OverflowItem[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const triggerRef = useRef<View>(null);

  function openMenu() {
    const node = triggerRef.current;
    if (!node) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }

  const win = Dimensions.get('window');
  const top = anchor ? anchor.y + anchor.height + 6 : 48;
  const right = anchor ? Math.max(8, win.width - (anchor.x + anchor.width)) : 10;

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          onPress={openMenu}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={styles.moreBtn}>
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={colors.textTitle}
          />
        </Pressable>
      </View>

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
        <View style={[styles.menu, { top, right }]}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              style={styles.menuItem}
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
                  color={item.destructive ? colors.accent : colors.lime}
                />
              ) : null}
              <Text
                style={[
                  styles.menuLabel,
                  item.destructive ? styles.menuLabelDestructive : null,
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingLeft: 14,
      paddingRight: 8,
      paddingTop: 14,
      paddingBottom: 10,
    },
    textCol: {
      flex: 1,
      minWidth: 0,
    },
    handle: {
      fontSize: 15,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.1,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    course: {
      flexShrink: 1,
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.textBody,
    },
    sep: {
      fontSize: 12.5,
      color: colors.textMuted,
    },
    metaTime: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    liveTime: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.lime,
    },
    rightSlot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    moreBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glassFill,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    menu: {
      position: 'absolute',
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
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 11,
      paddingVertical: 11,
      borderRadius: 12,
    },
    menuLabel: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.textTitle,
    },
    menuLabelDestructive: {
      color: colors.accent,
    },
  });
}
