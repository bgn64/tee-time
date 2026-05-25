import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

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
  onDelete,
}: ListItemWidgetProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconWrap}>
        <Ionicons name="list-outline" size={22} color="#2563eb" />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>
          {name || "Untitled list"}
        </Text>
        <Text style={styles.subtitle}>
          {completedCount}/{totalCount} completed
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteButton}>
        <Ionicons name="trash-outline" size={20} color="#b91c1c" />
      </TouchableOpacity>
      <Ionicons name="chevron-forward" size={18} color="#888" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "white",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
    gap: 12,
  },
  iconWrap: {
    width: 32,
    alignItems: "center",
  },
  textWrap: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: "#111",
    fontWeight: "500",
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  deleteButton: {
    padding: 6,
  },
});
