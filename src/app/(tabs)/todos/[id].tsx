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
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@powersync/react";

import { useSystem } from "@/library/powersync/system";
import { LISTS_TABLE, TODOS_TABLE } from "@/library/powersync/AppSchema";
import { TodoItemWidget } from "@/components/widgets/TodoItemWidget";
import { NameInputModal } from "@/components/widgets/NameInputModal";
import { confirmAsync, showAlert } from "@/library/utils/alert";
import { uuid } from "@/library/utils/uuid";

interface TodoRow {
  id: string;
  description: string | null;
  completed: number | null;
  list_id: string;
  created_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  completed_by: string | null;
}

interface ListRow {
  id: string;
  name: string | null;
}

export default function EditListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const system = useSystem();
  const [modalVisible, setModalVisible] = React.useState(false);

  const { data: lists } = useQuery<ListRow>(
    `SELECT id, name FROM ${LISTS_TABLE} WHERE id = ? LIMIT 1`,
    [id],
  );
  const list = lists?.[0];

  const { data: todos, isLoading } = useQuery<TodoRow>(
    `SELECT * FROM ${TODOS_TABLE} WHERE list_id = ? ORDER BY created_at ASC NULLS LAST`,
    [id],
  );

  const handleCreate = async (description: string) => {
    setModalVisible(false);
    try {
      const userId = await system.supabaseConnector.userId();
      if (!userId) {
        showAlert("Not signed in", "You must be signed in to add a todo.");
        return;
      }
      await system.powersync.execute(
        `INSERT INTO ${TODOS_TABLE} (id, list_id, created_at, description, created_by, completed) VALUES (?, ?, datetime(), ?, ?, 0)`,
        [uuid(), id, description, userId],
      );
    } catch (err: any) {
      showAlert("Could not add todo", err?.message ?? String(err));
    }
  };

  const handleToggle = async (todo: TodoRow) => {
    const nextCompleted = todo.completed ? 0 : 1;
    try {
      const userId = nextCompleted ? await system.supabaseConnector.userId() : null;
      await system.powersync.execute(
        `UPDATE ${TODOS_TABLE} SET completed = ?, completed_at = ?, completed_by = ? WHERE id = ?`,
        [
          nextCompleted,
          nextCompleted ? new Date().toISOString() : null,
          nextCompleted ? userId : null,
          todo.id,
        ],
      );
    } catch (err: any) {
      showAlert("Could not update todo", err?.message ?? String(err));
    }
  };

  const handleDelete = async (todo: TodoRow) => {
    const ok = await confirmAsync(
      "Delete todo?",
      todo.description ?? undefined,
    );
    if (!ok) return;
    try {
      await system.powersync.execute(`DELETE FROM ${TODOS_TABLE} WHERE id = ?`, [todo.id]);
    } catch (err: any) {
      showAlert("Could not delete todo", err?.message ?? String(err));
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: list?.name ?? "List" }} />
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={todos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TodoItemWidget
              description={item.description ?? ""}
              completed={!!item.completed}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No todos yet. Tap the + button to add one.
              </Text>
            </View>
          }
          contentContainerStyle={!todos || todos.length === 0 ? styles.emptyContent : undefined}
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
        title="New todo"
        placeholder="What needs doing?"
        submitLabel="Add"
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
});
