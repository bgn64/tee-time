import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassSurface, PHONE_MAX_WIDTH, SectionLabel } from '@/components/aurora';
import { signOut } from '@/library/supabase/auth';
import {
  useTheme,
  type ThemePreference,
} from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

const OPTIONS: {
  preference: ThemePreference;
  icon: string;
  label: string;
  detail: string;
}[] = [
  {
    preference: 'system',
    icon: '◐',
    label: 'System',
    detail: 'Match this device automatically',
  },
  {
    preference: 'light',
    icon: '☀',
    label: 'Light',
    detail: 'Always use the daylight palette',
  },
  {
    preference: 'dark',
    icon: '☾',
    label: 'Dark',
    detail: 'Always use Aurora night',
  },
];

export default function AppearanceScreen() {
  const { colors, preference, setPreference, themeName } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>
        Choose how Tee·Time looks. Your selection stays with this device.
      </Text>

      <SectionLabel>Color scheme</SectionLabel>
      <GlassSurface style={styles.optionList}>
        {OPTIONS.map((option, index) => {
          const selected = option.preference === preference;
          return (
            <Pressable
              key={option.preference}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.label}. ${option.detail}`}
              onPress={() => {
                void setPreference(option.preference);
              }}
              style={({ pressed }) => [
                styles.option,
                index < OPTIONS.length - 1 ? styles.optionBorder : null,
                pressed ? styles.pressed : null,
              ]}>
              <View style={styles.icon}>
                <Text style={styles.iconText}>{option.icon}</Text>
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDetail}>{option.detail}</Text>
              </View>
              <View style={[styles.radio, selected ? styles.radioSelected : null]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </GlassSurface>

      {preference === 'system' ? (
        <View style={styles.systemNote}>
          <Text style={styles.systemIcon}>◐</Text>
          <View style={styles.systemCopy}>
            <Text style={styles.systemTitle}>
              Following system · {themeName === 'light' ? 'Light' : 'Dark'}
            </Text>
            <Text style={styles.systemDetail}>
              If the device does not report a color scheme, Tee·Time uses Light.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.account}>
        <SectionLabel>Account</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => {
            void signOut();
          }}
          style={({ pressed }) => [
            styles.signOut,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    content: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 48,
    },
    intro: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
      marginHorizontal: 4,
      marginBottom: 4,
    },
    optionList: {
      borderRadius: 22,
      paddingHorizontal: 16,
    },
    option: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingVertical: 12,
      paddingHorizontal: 2,
    },
    optionBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.glassStroke,
    },
    icon: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    iconText: {
      color: colors.textTitle,
      fontSize: 17,
      fontWeight: '700',
    },
    optionCopy: {
      flex: 1,
      minWidth: 0,
    },
    optionLabel: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '700',
    },
    optionDetail: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 3,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {
      borderColor: colors.lime,
      backgroundColor: colors.glowLime,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.lime,
    },
    pressed: {
      opacity: 0.7,
    },
    systemNote: {
      flexDirection: 'row',
      gap: 11,
      marginTop: 14,
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.glowCyan,
      borderWidth: 1,
      borderColor: colors.cyan,
    },
    systemIcon: {
      color: colors.cyan,
      fontSize: 13,
      fontWeight: '800',
    },
    systemCopy: {
      flex: 1,
    },
    systemTitle: {
      color: colors.cyan,
      fontSize: 13,
      fontWeight: '800',
    },
    systemDetail: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
    },
    account: {
      marginTop: 16,
    },
    signOut: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.glassFill,
    },
    signOutText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '800',
    },
  });
}
