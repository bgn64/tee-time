import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  GlassSurface,
  NeonButton,
  PHONE_MAX_WIDTH,
  SectionLabel,
} from '@/components/aurora';
import type { StatDefinition } from '@/library/golf/builtInStats';
import { createCustomBinaryStat } from '@/library/golf/customStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  visible: boolean;
  ownerUserId: string;
  onCancel: () => void;
  onCreated: (definition: StatDefinition) => void;
};

export function CustomStatSheet({
  visible,
  ownerUserId,
  onCancel,
  onCreated,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const inputRef = useRef<TextInput | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (saving) return;
    setName('');
    setError(null);
    onCancel();
  }

  async function save() {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const definition = await createCustomBinaryStat(ownerUserId, name);
      setName('');
      onCreated(definition);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not create the custom stat.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      onShow={() => setTimeout(() => inputRef.current?.focus(), 50)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} />
        <GlassSurface strong glow style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>Add custom stat</Text>
          <Text style={styles.subtitle}>
            Save it once, then choose it for any future round.
          </Text>

          <View style={styles.field}>
            <Ionicons name="sparkles-outline" size={17} color={colors.cyan} />
            <View style={styles.fieldCopy}>
              <Text style={styles.fieldLabel}>Stat name</Text>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Bogey GIR"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="sentences"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                maxLength={40}
              />
            </View>
          </View>

          <SectionLabel>Stat type</SectionLabel>
          <View style={styles.typeRow}>
            <View style={[styles.typeCard, styles.typeCardSelected]}>
              <Text style={[styles.typeTitle, styles.typeTitleSelected]}>
                Yes / no
              </Text>
              <Text style={styles.typeSubtitle}>Mark each hole</Text>
            </View>
            <View style={[styles.typeCard, styles.typeCardDisabled]}>
              <Text style={styles.typeTitle}>Integer</Text>
              <Text style={styles.typeSubtitle}>Coming later</Text>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <NeonButton
            label={saving ? 'Saving…' : 'Save & track'}
            disabled={saving || !name.trim()}
            onPress={() => void save()}
            iconRight={
              saving ? <ActivityIndicator color={colors.onNeon} /> : undefined
            }
          />
        </GlassSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      backgroundColor: colors.sheetBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 24,
    },
    grab: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    title: {
      color: colors.textTitle,
      fontSize: 16,
      fontWeight: '900',
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: '600',
      marginTop: 3,
      marginBottom: 14,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      backgroundColor: colors.glassFill2,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    fieldCopy: {
      flex: 1,
      minWidth: 0,
    },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    input: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '800',
      padding: 0,
      marginTop: 2,
    },
    typeRow: {
      flexDirection: 'row',
      gap: 9,
      marginBottom: 14,
    },
    typeCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      backgroundColor: colors.glassFill,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    typeCardSelected: {
      borderColor: colors.lime,
      backgroundColor: colors.glowLime,
    },
    typeCardDisabled: {
      opacity: 0.55,
    },
    typeTitle: {
      color: colors.textTitle,
      fontSize: 13,
      fontWeight: '800',
    },
    typeTitleSelected: {
      color: colors.lime,
    },
    typeSubtitle: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
      marginTop: 3,
    },
    error: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '800',
      marginBottom: 10,
    },
  });
}
