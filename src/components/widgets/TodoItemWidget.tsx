import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/library/theme/ThemeContext';

interface TodoItemWidgetProps {
  description: string;
  completed: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

export function TodoItemWidget({ description, completed, onToggle, onDelete }: TodoItemWidgetProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={onToggle} hitSlop={8} style={styles.checkbox}>
        <Ionicons
          name={completed ? 'checkbox' : 'square-outline'}
          size={24}
          color={completed ? colors.primary : colors.textMuted}
        />
      </TouchableOpacity>
      <Text
        style={[styles.description, completed && styles.completedText]}
        numberOfLines={2}>
        {description || '(empty)'}
      </Text>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteButton}>
        <Ionicons name="trash-outline" size={20} color={colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 16,
      backgroundColor: colors.glassFill,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 18,
      gap: 12,
      marginBottom: 10
    },
    checkbox: {
      padding: 2,
      borderRadius: 12,
      backgroundColor: colors.glowLime
    },
    description: {
      flex: 1,
      fontSize: 16,
      color: colors.textTitle,
      fontWeight: '600'
    },
    completedText: {
      textDecorationLine: 'line-through',
      color: colors.textMuted
    },
    deleteButton: {
      padding: 6
    }
  });
}
