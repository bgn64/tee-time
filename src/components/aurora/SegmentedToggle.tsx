/**
 * SegmentedToggle — glass segmented control with strong selected segments.
 */

import { useMemo, type JSX } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function SegmentedToggle<T extends string>(props: { options: { key: T; label: string; sublabel?: string }[]; value: T; onChange: (key: T) => void; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.root, props.style]}>
      {props.options.map((option) => {
        const selected = option.key === props.value;
        return (
          <Pressable
            key={option.key}
            onPress={() => props.onChange(option.key)}
            accessibilityRole="button"
            accessibilityLabel={option.sublabel ? `${option.label}, ${option.sublabel}` : option.label}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.segment,
              selected ? styles.segmentSelected : null,
              pressed ? styles.segmentPressed : null,
            ]}>
            <Text style={[styles.label, selected ? styles.labelSelected : null]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.sublabel ? (
              <Text style={[styles.sublabel, selected ? styles.sublabelSelected : null]} numberOfLines={1}>
                {option.sublabel}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flexDirection: 'row',
      gap: 6,
      padding: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      backgroundColor: colors.glassFill,
    },
    segment: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    segmentSelected: {
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    segmentPressed: {
      opacity: 0.78,
    },
    label: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    labelSelected: {
      color: colors.textTitle,
    },
    sublabel: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '600',
    },
    sublabelSelected: {
      color: colors.cyan,
    },
  });
}
