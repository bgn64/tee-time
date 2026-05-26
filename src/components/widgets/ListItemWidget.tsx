import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/library/theme/ThemeContext';

interface ListItemWidgetProps {
  name: string;
  totalCount: number;
  completedCount: number;
  onPress: () => void;
  onDelete: () => void;
}

export function ListItemWidget({
  name,
  totalCount,
  completedCount,
  onPress,
  onDelete
}: ListItemWidgetProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconWrap}>
        <Ionicons name="list-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>
          {name || 'Untitled list'}
        </Text>
        <Text style={styles.subtitle}>
          {completedCount}/{totalCount} completed
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteButton}>
        <Ionicons name="trash-outline" size={20} color={colors.accent} />
      </TouchableOpacity>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.cardBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 12
    },
    iconWrap: {
      width: 32,
      alignItems: 'center'
    },
    textWrap: {
      flex: 1
    },
    name: {
      fontSize: 16,
      color: colors.textTitle,
      fontWeight: '600'
    },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2
    },
    deleteButton: {
      padding: 6
    }
  });
}
