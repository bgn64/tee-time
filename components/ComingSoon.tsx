/**
 * Generic "Coming soon" placeholder used by Phase 1 You-tab sub-screens
 * (Notifications / Account / About). Each screen wraps this with its own
 * useScreenHeader chrome.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

type Props = {
  title: string;
  body: string;
  icon?: string;
};

export function ComingSoon({ title, body, icon = '🛠' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>COMING SOON</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: 32,
      gap: 8,
    },
    icon: { fontSize: 40, opacity: 0.6, marginBottom: 4 },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
    },
    body: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 260,
    },
    badge: {
      marginTop: 14,
      backgroundColor: '#fbbf24',
      borderRadius: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    badgeText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: '#ffffff',
    },
  });
}
