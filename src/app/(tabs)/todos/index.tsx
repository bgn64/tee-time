import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useQuery } from "@powersync/react";

import { useSystem } from "@/library/powersync/system";
import { LISTS_TABLE, TODOS_TABLE } from "@/library/powersync/AppSchema";
import { ListItemWidget } from "@/components/widgets/ListItemWidget";
import { NameInputModal } from "@/components/widgets/NameInputModal";
import { confirmAsync, showAlert } from "@/library/utils/alert";
import { uuid } from "@/library/utils/uuid";

interface ListRow {
  id: string;
  name: string | null;
  created_at: string | null;
  owner_id: string | null;
  total_count: number;
  completed_count: number;
}

const LISTS_WITH_COUNTS_SQL = `
  SELECT
    lists.*,
    COALESCE(counts.total, 0) AS total_count,
    COALESCE(counts.done, 0) AS completed_count
  FROM ${LISTS_TABLE} AS lists
  LEFT JOIN (
    SELECT list_id, COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done
    FROM ${TODOS_TABLE}
    GROUP BY list_id
  ) AS counts ON counts.list_id = lists.id
  ORDER BY lists.created_at DESC NULLS LAST
`;

export default function ListsScreen() {
  const system = useSystem();
  const { data: lists, isLoading } = useQuery<ListRow>(LISTS_WITH_COUNTS_SQL);
  const [modalVisible, setModalVisible] = React.useState(false);

  const handleCreate = async (name: string) => {
    setModalVisible(false);
    try {
      const userId = await system.supabaseConnector.userId();
      if (!userId) {
        showAlert("Not signed in", "You must be signed in to create a list.");
        return;
      }
      await system.powersync.execute(
        `INSERT INTO ${LISTS_TABLE} (id, created_at, name, owner_id) VALUES (?, datetime(), ?, ?)`,
        [uuid(), name, userId],
      );
    } catch (err: any) {
      showAlert("Could not create list", err?.message ?? String(err));
    }
  };

  const handleDelete = async (list: ListRow) => {
    const ok = await confirmAsync(
      "Delete list?",
      `"${list.name ?? "Untitled"}" and its todos will be removed.`,
    );
    if (!ok) return;
    try {
      await system.powersync.writeTransaction(async (tx) => {
        await tx.execute(`DELETE FROM ${TODOS_TABLE} WHERE list_id = ?`, [list.id]);
        await tx.execute(`DELETE FROM ${LISTS_TABLE} WHERE id = ?`, [list.id]);
      });
    } catch (err: any) {
      showAlert("Could not delete list", err?.message ?? String(err));
    }
  };

  const handleOpen = (list: ListRow) => {
    router.push({ pathname: "/(tabs)/todos/[id]", params: { id: list.id } });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Lists",
          headerRight: () => (
            <TouchableOpacity onPress={() => system.signOut()} hitSlop={8} style={styles.headerButton}>
              <Ionicons name="log-out-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListItemWidget
              name={item.name ?? ""}
              totalCount={Number(item.total_count) || 0}
              completedCount={Number(item.completed_count) || 0}
              onPress={() => handleOpen(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No lists yet. Tap the + button to create one.
              </Text>
            </View>
          }
          contentContainerStyle={lists.length === 0 ? styles.emptyContent : undefined}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>

      <NameInputModal
        visible={modalVisible}
        title="New list"
        placeholder="List name"
        submitLabel="Create"
        onSubmit={handleCreate}
        onCancel={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyContent: {
    flex: 1,
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
    fontSize: 15,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: Platform.OS === "web" ? 20 : 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headerButton: {
    paddingHorizontal: 8,
  },
});
