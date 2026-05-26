import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';

interface NameInputModalProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Tiny cross-platform modal that asks the user for a single string.
 */
export function NameInputModal({
  visible,
  title,
  placeholder,
  initialValue = '',
  submitLabel = 'Save',
  onSubmit,
  onCancel
}: NameInputModalProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      {/* key={String(visible)} resets the input state every time the modal opens */}
      <NameInputModalBody
        key={String(visible)}
        title={title}
        placeholder={placeholder}
        initialValue={initialValue}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </Modal>
  );
}

type BodyProps = Omit<NameInputModalProps, 'visible'>;

function NameInputModalBody({
  title,
  placeholder,
  initialValue = '',
  submitLabel = 'Save',
  onSubmit,
  onCancel
}: BodyProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [value, setValue] = React.useState(initialValue);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={setValue}
          autoFocus
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={onCancel} style={[styles.button, styles.cancelButton]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSubmit} style={[styles.button, styles.submitButton]}>
            <Text style={styles.submitText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 12,
      color: colors.textTitle
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.textTitle,
      backgroundColor: colors.background
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 16
    },
    button: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8
    },
    cancelButton: {
      backgroundColor: colors.chipBg
    },
    cancelText: {
      color: colors.textBody,
      fontWeight: '600'
    },
    submitButton: {
      backgroundColor: colors.primary
    },
    submitText: {
      color: '#ffffff',
      fontWeight: '700'
    }
  });
}
