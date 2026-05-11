/**
 * Bottom sheet listing the full set of recently-played courses (MRU). Used
 * by the Score-tab course selection screen when there are more recents
 * than the inline shortlist shows. Tapping a row hands the course id back
 * via `onSelect` and dismisses; the parent handles navigation.
 */

import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';
import { Course } from '@/types/golf';

export type RecentCourseEntry = {
  course: Course;
  lastPlayedAt: string | null;
};

type Props = {
  visible: boolean;
  entries: RecentCourseEntry[];
  onClose: () => void;
  onSelect: (courseId: string) => void;
};

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export function RecentCoursesSheet({ visible, entries, onClose, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>Recent courses</Text>
          <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {entries.map(({ course, lastPlayedAt }) => {
              const enriched = course.holes.length > 0;
              const totalPar = enriched ? course.holes.reduce((t, h) => t + h.par, 0) : null;
              const trailingSegments = [
                course.location,
                enriched ? `${course.holes.length} holes` : null,
                enriched && totalPar !== null ? `Par ${totalPar}` : null,
              ].filter((s): s is string => !!s && s.length > 0);
              return (
                <Pressable
                  key={course.id}
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    setTimeout(() => onSelect(course.id), 0);
                  }}>
                  <View style={styles.swatch}>
                    <Text style={styles.swatchGlyph}>⛳</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                      {course.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {lastPlayedAt ? `Played ${formatRelative(lastPlayedAt)}` : 'Not played yet'}
                      {trailingSegments.length > 0 ? ` · ${trailingSegments.join(' · ')}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    backdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 22,
      maxHeight: '85%',
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
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    listContent: {
      paddingBottom: 8,
      gap: 7,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
    },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchGlyph: { color: '#ffffff', fontSize: 16 },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 13.5, fontWeight: '800', color: colors.textTitle },
    meta: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
    chev: { fontSize: 18, color: colors.textMuted, opacity: 0.5 },
  });
}
