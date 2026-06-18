import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard, GlassSurface, NeonButton } from '@/components/aurora';
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
      <GlassCard strong glow style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <GlassSurface strong style={styles.inputShell}>
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
        </GlassSurface>
        <View style={styles.buttonRow}>
          <Pressable onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <NeonButton label={submitLabel} onPress={handleSubmit} size="sm" style={styles.submitButton} />
        </View>
      </GlassCard>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.night,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24
    },
    card: {
      width: '100%',
      maxWidth: 420,
      padding: 20
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 14,
      color: colors.textTitle
    },
    inputShell: {
      borderRadius: 16,
      marginBottom: 2
    },
    input: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      fontWeight: '700',
      color: colors.textTitle,
      minHeight: 44
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 16
    },
    cancelButton: {
      minHeight: 36,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      backgroundColor: colors.glassFill2,
      justifyContent: 'center'
    },
    cancelText: {
      color: colors.textBody,
      fontWeight: '700'
    },
    submitButton: {
      minWidth: 86
    }
  });
}
