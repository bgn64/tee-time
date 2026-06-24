/**
 * Add Course — create a course that isn't in the catalog, reached from the
 * Search · Courses pane. On save it opens the new course's detail screen
 * (a private course only the creator can see).
 */

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AddCourseForm } from '@/components/course/AddCourseForm';
import type { Course } from '@/types/golf';

export default function AddCourseScreen() {
  const onCreated = (course: Course) => {
    router.replace({
      pathname: '/(tabs)/(search)/course/[id]' as never,
      params: { id: course.id },
    });
  };

  return (
    <View style={styles.container}>
      <AddCourseForm onCreated={onCreated} submitLabel="Save course" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
});
