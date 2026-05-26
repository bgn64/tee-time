/**
 * OtpInput — 6-cell one-time-code input.
 *
 * Adapted from the destination tee-time app's `components/OtpInput.tsx`.
 *
 * Implementation note: a single hidden `TextInput` sits absolutely
 * positioned on top of 6 visible cell `View`s. The TextInput holds the
 * full value, so native paste / auto-fill (iOS `oneTimeCode`, Android
 * `sms-otp`) work without per-cell focus management.
 *
 * On web (react-native-web), the hidden input uses `opacity: 0` rather
 * than `display: none` so it remains focusable and accepts clicks routed
 * through the visible cell area above it.
 */

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
};

const CELL_COUNT = 6;

export function OtpInput({ value, onChange, onSubmit, autoFocus, disabled }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const sanitized = value.replace(/\D/g, '').slice(0, CELL_COUNT);

  // Track whether we've already fired onSubmit for the current 6-digit
  // value so we don't re-fire on every re-render while length stays at 6.
  const submittedRef = React.useRef(sanitized.length === CELL_COUNT);

  React.useEffect(() => {
    if (sanitized.length === CELL_COUNT) {
      if (!submittedRef.current) {
        submittedRef.current = true;
        onSubmit?.();
      }
    } else {
      submittedRef.current = false;
    }
  }, [sanitized.length, onSubmit]);

  const handleChange = (next: string) => {
    onChange(next.replace(/\D/g, '').slice(0, CELL_COUNT));
  };

  return (
    <View style={styles.row}>
      {Array.from({ length: CELL_COUNT }).map((_, i) => {
        const digit = sanitized[i] ?? '';
        const isActive = !disabled && sanitized.length === i;
        return (
          <View key={i} style={[styles.cell, isActive && styles.cellActive]}>
            <Text style={styles.cellText}>{digit}</Text>
          </View>
        );
      })}

      <TextInput
        value={sanitized}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        editable={!disabled}
        maxLength={CELL_COUNT}
        caretHidden
        selectionColor="transparent"
        accessibilityLabel="Six-digit verification code"
        style={styles.hiddenInput}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignSelf: 'center',
      gap: 8,
      position: 'relative'
    },
    cell: {
      width: 44,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 8,
      borderColor: colors.border,
      backgroundColor: colors.cardBg
    },
    cellActive: {
      borderColor: colors.primary,
      borderWidth: 2
    },
    cellText: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textTitle
    },
    hiddenInput: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0,
      color: 'transparent',
      textAlign: 'center',
      fontSize: 22
    }
  });
}
