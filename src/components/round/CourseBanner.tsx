/**
 * CourseBanner — the feed card's header.
 *
 * A deterministically generated course banner (gradient + motif; see
 * `courseBanner.ts`) titled Instagram-style: the round owner's @handle
 * is the prominent line, with `course · location` as a subscript. It
 * replaces the text `EditorialHeader` on the feed card and stands in
 * for course photos.
 *
 * A ⋯ overflow (top-right) opens an anchored popover with round actions
 * (e.g. Edit) — same look as `HeaderOverflowMenu`, but anchored to the
 * button's measured position since a card sits anywhere in the scroll.
 * Moving Edit here keeps the footer action bar uniform (Like + Comments)
 * across every round.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Ellipse, G, Line, Path, Polygon } from 'react-native-svg';

import {
  bannerStyleForCourse,
  gradientColors,
  gradientVector,
  type BannerMotif,
  type CourseBannerStyle,
} from '@/library/golf/courseBanner';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Course } from '@/types/golf';

import type { OverflowItem } from './HeaderOverflowMenu';

const BANNER_HEIGHT = 124;
const MOTIF_W = 404;

type Props = {
  course: Course;
  /** Round owner's @handle (without the leading @). */
  handle?: string | null;
  /** Fallback title when no handle is known. */
  displayName?: string | null;
  /** Small-caps meta, e.g. "Completed · 2h ago" or "LIVE · THRU 11". */
  metaLeft: string;
  /** Optional trailing meta after a dot, e.g. "12m ago". */
  metaRight?: string;
  isLive?: boolean;
  /** When non-empty, a ⋯ opens an anchored popover with these actions. */
  overflowActions?: OverflowItem[];
};

export function CourseBanner({
  course,
  handle,
  displayName,
  metaLeft,
  metaRight,
  isLive = false,
  overflowActions,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const bannerStyle = useMemo(() => bannerStyleForCourse(course), [course]);
  const grad = useMemo(() => gradientColors(bannerStyle), [bannerStyle]);
  const vector = useMemo(
    () => gradientVector(bannerStyle.angle),
    [bannerStyle.angle]
  );

  const title = handle ? `@${handle}` : displayName || course.name;
  const subtitle = course.location
    ? `${course.name} · ${course.location}`
    : course.name;
  const meta = metaRight ? `${metaLeft} · ${metaRight}` : metaLeft;

  return (
    <View style={styles.banner}>
      <LinearGradient
        colors={grad}
        start={vector.start}
        end={vector.end}
        style={StyleSheet.absoluteFill}
      />
      <CourseMotif bannerStyle={bannerStyle} />
      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.58)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.metaRow}>
          {isLive ? <View style={styles.liveDot} /> : null}
          <Text style={styles.metaText} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View>
          <Text style={styles.handle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      {overflowActions && overflowActions.length > 0 ? (
        <BannerOverflowMenu items={overflowActions} />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Background motif (react-native-svg) — white, low-opacity over the   */
/* gradient. One of four variants picked deterministically per course. */
/* ------------------------------------------------------------------ */

function CourseMotif({ bannerStyle }: { bannerStyle: CourseBannerStyle }) {
  const fx = Math.round((bannerStyle.flagX / 100) * MOTIF_W);
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${MOTIF_W} ${BANNER_HEIGHT}`}
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}>
      {renderMotif(bannerStyle.motif, fx)}
    </Svg>
  );
}

function Flag({ x, topY }: { x: number; topY: number }) {
  return (
    <G>
      <Line
        x1={x}
        y1={topY}
        x2={x}
        y2={topY + 40}
        stroke="#ffffff"
        strokeOpacity={0.85}
        strokeWidth={2}
      />
      <Polygon
        points={`${x},${topY} ${x + 20},${topY + 6} ${x},${topY + 12}`}
        fill="#ffffff"
        fillOpacity={0.9}
      />
    </G>
  );
}

function renderMotif(motif: BannerMotif, fx: number) {
  if (motif === 0) {
    return (
      <>
        <G fill="none" stroke="#ffffff" strokeOpacity={0.42} strokeWidth={1.2}>
          <Path d="M-10 90 C 80 70, 150 100, 240 80 S 380 64, 420 84" />
          <Path d="M-10 102 C 80 84, 150 112, 240 92 S 380 78, 420 96" />
          <Path d="M-10 78 C 80 58, 160 90, 250 68 S 380 52, 420 72" />
        </G>
        <Flag x={fx} topY={34} />
      </>
    );
  }
  if (motif === 1) {
    return (
      <>
        <G fill="none" stroke="#ffffff" strokeOpacity={0.42} strokeWidth={1.2}>
          <Path d="M-10 98 C 60 58, 140 110, 210 78 S 360 48, 420 96" />
          <Path d="M-10 84 C 70 50, 150 100, 230 70 S 370 40, 420 82" />
          <Path d="M-10 110 C 60 78, 150 120, 220 96 S 360 70, 420 108" />
        </G>
        <Flag x={fx} topY={30} />
      </>
    );
  }
  if (motif === 2) {
    return (
      <>
        <Path
          d="M-10 124 L-10 92 C 90 74, 180 106, 280 88 S 420 72, 420 98 L420 124 Z"
          fill="#ffffff"
          fillOpacity={0.13}
        />
        <G fill="none" stroke="#ffffff" strokeOpacity={0.4} strokeWidth={1.1}>
          <Path d="M-10 80 C 90 64, 180 92, 280 76 S 420 62, 420 86" />
        </G>
        <Flag x={fx} topY={30} />
      </>
    );
  }
  return (
    <>
      <G fill="none" stroke="#ffffff" strokeOpacity={0.4} strokeWidth={1.2}>
        <Ellipse cx={fx} cy={82} rx={26} ry={13} />
        <Ellipse cx={fx} cy={82} rx={52} ry={26} />
        <Ellipse cx={fx} cy={82} rx={82} ry={40} />
        <Ellipse cx={fx} cy={82} rx={116} ry={56} />
      </G>
      <Flag x={fx} topY={40} />
    </>
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
      <View ref={triggerRef} style={styles.moreWrap} collapsable={false}>
        <Pressable
          onPress={openMenu}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={styles.moreBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#ffffff" />
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
                  color={item.destructive ? colors.accent : colors.textTitle}
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
    banner: {
      height: BANNER_HEIGHT,
      width: '100%',
      overflow: 'hidden',
    },
    content: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 13,
      paddingBottom: 13,
      justifyContent: 'space-between',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#ffffff',
    },
    metaText: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 0.3,
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    handle: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '900',
      letterSpacing: -0.3,
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 10,
    },
    subtitle: {
      marginTop: 4,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 12,
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 8,
    },
    moreWrap: {
      position: 'absolute',
      top: 9,
      right: 9,
    },
    moreBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.3)',
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
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 5,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      elevation: 8,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 11,
      paddingVertical: 11,
      borderRadius: 8,
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
