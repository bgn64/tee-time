/**
 * Reusable primer screen layout.
 *
 * Two primers (account, location) share the same shape: hero icon →
 * title → body → 3-bullet list → primary CTA → "Maybe later". This
 * component centralizes the layout so each primer screen only supplies
 * its content + handlers.
 */

import { PropsWithChildren, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

export type PrimerBullet = {
  icon: string;
  heading: string;
  body: string;
};

type Props = {
  heroIcon: string;
  title: string;
  body: string;
  bullets: PrimerBullet[];
  primaryLabel: string;
  onPrimary: () => void;
  onDismiss: () => void;
  primaryBusy?: boolean;
};

export function PrimerScreen({
  heroIcon,
  title,
  body,
  bullets,
  primaryLabel,
  onPrimary,
  onDismiss,
  primaryBusy,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.skipRow}>
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Text style={styles.heroIcon}>{heroIcon}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>

        <View style={styles.bullets}>
          {bullets.map((b, idx) => (
            <View key={idx} style={styles.bullet}>
              <Text style={styles.bulletIcon}>{b.icon}</Text>
              <View style={styles.bulletText}>
                <Text style={styles.bulletHeading}>{b.heading}</Text>
                <Text style={styles.bulletBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.ctaStack}>
        <Pressable
          style={[styles.primaryBtn, primaryBusy && styles.primaryBtnBusy]}
          onPress={onPrimary}
          disabled={primaryBusy}>
          <Text style={styles.primaryBtnText}>
            {primaryBusy ? 'One moment…' : primaryLabel}
          </Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>Maybe later</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 22,
    },
    skipRow: {
      alignItems: 'flex-end',
    },
    skipBtn: {
      padding: 8,
    },
    skipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingVertical: 8 },
    hero: {
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 6,
      marginBottom: 18,
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    heroIcon: { fontSize: 56 },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center',
      lineHeight: 30,
    },
    body: {
      fontSize: 14,
      color: colors.textBody,
      textAlign: 'center',
      lineHeight: 21,
      maxWidth: 320,
    },
    bullets: {
      gap: 10,
    },
    bullet: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 12,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
    },
    bulletIcon: {
      fontSize: 18,
      lineHeight: 22,
      marginTop: 1,
    },
    bulletText: { flex: 1 },
    bulletHeading: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 2,
    },
    bulletBody: {
      fontSize: 12.5,
      color: colors.textBody,
      lineHeight: 17,
    },
    ctaStack: {
      gap: 8,
      marginTop: 18,
    },
    primaryBtn: {
      height: 50,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnBusy: {
      opacity: 0.6,
    },
    primaryBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    ghostBtn: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    ghostBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
  });
}
