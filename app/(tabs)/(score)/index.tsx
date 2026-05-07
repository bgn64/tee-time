/**
 * Course Selection — root of the Score tab when no round is active.
 *
 * Three-tab structure (All / Recents / Custom) with search across all
 * courses; tab labels gain count badges while a search query is active so
 * the user can pivot between scopes without retyping. The active tab still
 * scopes the visible result list. The "+ Create" CTA lives at the bottom
 * (muted by default, prominent on no-results) and pre-fills the new-course
 * form's name field with the search query.
 *
 * Custom courses carry a ⋯ button that opens CourseActionsSheet (Edit / Delete).
 * Catalog courses don't expose those actions; they're read-only.
 */

import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CourseActionsSheet } from '@/components/CourseActionsSheet';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';
import { Course, Round } from '@/types/golf';

type TabKey = 'all' | 'recents' | 'custom';

const TAB_ORDER: TabKey[] = ['all', 'recents', 'custom'];
const TAB_LABEL: Record<TabKey, string> = {
  all: 'All',
  recents: 'Recents',
  custom: 'Custom',
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function lastPlayedAt(courseId: string, completedRounds: Round[]): string | null {
  let latest: string | null = null;
  for (const round of completedRounds) {
    if (round.course.id !== courseId || !round.completedAt) continue;
    if (latest === null || round.completedAt > latest) latest = round.completedAt;
  }
  return latest;
}

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

function matchesQuery(course: Course, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    course.name.toLowerCase().includes(q) ||
    course.location.toLowerCase().includes(q)
  );
}

export default function CourseSelectionScreen() {
  const { colors } = useTheme();
  const {
    courses,
    completedRounds,
    pendingSelectedCourseId,
    setPendingSelectedCourseId,
    removeCourse,
  } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [query, setQuery] = useState<string>('');
  const [actionsCourseId, setActionsCourseId] = useState<string | null>(null);

  useScreenHeader({
    left: { kind: 'text', text: 'SCORE' },
    right: { kind: 'profile' },
  });

  // After saving a course (create or edit), new-course.tsx parks the affected
  // course id in context. Consume it here on focus: jump to All, pre-select,
  // and clear any active search.
  useFocusEffect(
    useCallback(() => {
      if (pendingSelectedCourseId) {
        setSelectedCourseId(pendingSelectedCourseId);
        setActiveTab('all');
        setQuery('');
        setPendingSelectedCourseId(null);
      }
    }, [pendingSelectedCourseId, setPendingSelectedCourseId])
  );

  // Resume an in-progress round whenever the Score tab focuses with a
  // currentRound present. Two scenarios this covers:
  //   1. Cold launch with a persisted round — Score is the default tab
  //      (see (tabs)/_layout.tsx), so this effect fires immediately and
  //      drops the user straight into /scoring instead of course selection.
  //   2. Mid-session navigation — user is on /scoring, switches to another
  //      tab, then taps Score again. The stack would otherwise return to
  //      this index; this jump keeps them in the round.
  const { currentRound } = useGolfRound();
  useFocusEffect(
    useCallback(() => {
      if (currentRound) {
        router.replace('/(tabs)/(score)/scoring');
      }
    }, [currentRound])
  );

  // Decorate each course with last-played, then sort: most-recently played
  // first, courses never played fall to the bottom alphabetically. Done once
  // at the All level; subset filters reuse this ordering.
  const decoratedAll = useMemo(() => {
    return courses
      .map((course) => ({ course, lastPlayedAt: lastPlayedAt(course.id, completedRounds) }))
      .sort((a, b) => {
        if (a.lastPlayedAt && b.lastPlayedAt) {
          return a.lastPlayedAt < b.lastPlayedAt ? 1 : -1;
        }
        if (a.lastPlayedAt) return -1;
        if (b.lastPlayedAt) return 1;
        return a.course.name.localeCompare(b.course.name);
      });
  }, [courses, completedRounds]);

  const filtered = useMemo(() => {
    const all = decoratedAll.filter((entry) => matchesQuery(entry.course, query));
    return {
      all,
      recents: all.filter((entry) => entry.lastPlayedAt !== null),
      custom: all.filter((entry) => entry.course.source === 'custom'),
    };
  }, [decoratedAll, query]);

  const visibleList = filtered[activeTab];
  const searchActive = query.trim().length > 0;
  const noResults = searchActive && visibleList.length === 0;

  function handleNext() {
    if (!selectedCourseId) return;
    router.push({
      pathname: '/(tabs)/(score)/player-config',
      params: { courseId: selectedCourseId },
    });
  }

  function emptyMessage(): { icon: string; title: string; body: string } {
    if (noResults) {
      return {
        icon: '🔍',
        title: `No matches for "${query.trim()}"`,
        body: "Don't see your course? Add it to your custom library.",
      };
    }
    if (activeTab === 'recents') {
      return {
        icon: '⏱️',
        title: 'No recent rounds',
        body: "Courses you've played will show up here, sorted by most recent.",
      };
    }
    if (activeTab === 'custom') {
      return {
        icon: '⛳',
        title: 'No custom courses yet',
        body: 'Courses you create will live here, separate from the global catalog.',
      };
    }
    return {
      icon: '⛳',
      title: 'No courses yet',
      body: 'Start by creating one below.',
    };
  }

  const createLabel = searchActive
    ? `+ Create "${query.trim()}"`
    : '+ Create new course';

  const sheetCourse = actionsCourseId
    ? courses.find((c) => c.id === actionsCourseId)
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.fixedTop}>
        <Text style={styles.greeting}>{getGreeting()}</Text>
        <Text style={styles.title}>Where are you playing?</Text>

        <View style={[styles.searchBox, searchActive && styles.searchBoxActive]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search courses"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchActive && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.searchClear}>×</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.tabs}>
          {TAB_ORDER.map((tab) => {
            const isActive = activeTab === tab;
            const count = filtered[tab].length;
            return (
              <Pressable
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {TAB_LABEL[tab]}
                  {searchActive && (
                    <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                      {' '}
                      {count}
                    </Text>
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {visibleList.length === 0 ? (
          <View style={styles.emptyWrap}>
            {(() => {
              const e = emptyMessage();
              return (
                <>
                  <Text style={styles.emptyIcon}>{e.icon}</Text>
                  <Text style={styles.emptyTitle}>{e.title}</Text>
                  <Text style={styles.emptyBody}>{e.body}</Text>
                </>
              );
            })()}
          </View>
        ) : (
          visibleList.map(({ course, lastPlayedAt: lp }) => {
            const isSelected = course.id === selectedCourseId;
            const totalPar = course.holes.reduce((t, h) => t + h.par, 0);
            const isCustom = course.source === 'custom';
            return (
              <Pressable
                key={course.id}
                onPress={() => setSelectedCourseId(course.id)}
                style={[styles.courseCard, isSelected && styles.courseCardSelected]}>
                <View style={styles.courseCardBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.courseName} numberOfLines={1}>
                      {course.name}
                    </Text>
                    {isCustom && <Text style={styles.sourceBadge}>CUSTOM</Text>}
                  </View>
                  <Text style={styles.courseMeta}>
                    {course.location ? `${course.location} · ` : ''}
                    {course.holes.length} holes · Par {totalPar}
                  </Text>
                  {lp && (
                    <Text style={styles.courseRecent}>Played {formatRelative(lp)}</Text>
                  )}
                </View>
                {isCustom && (
                  <Pressable
                    style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
                    hitSlop={8}
                    onPress={() => setActionsCourseId(course.id)}
                    accessibilityLabel={`Actions for ${course.name}`}>
                    <Text style={styles.menuGlyph}>⋯</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}

        {/* Inline Create row — always rendered as the last list item. Mirrors
            the "+ Add Player" pattern in player-config: discoverable mid-list
            and consistent in style across empty/non-empty states. */}
        <Link
          href={{
            pathname: '/(tabs)/(score)/new-course',
            params: searchActive ? { prefillName: query.trim() } : {},
          }}
          asChild>
          <Pressable style={styles.createBtn}>
            <Text style={styles.createBtnText}>{createLabel}</Text>
          </Pressable>
        </Link>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.nextBtn, !selectedCourseId && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={!selectedCourseId}>
          <Text style={styles.nextBtnText}>Next →</Text>
        </Pressable>
      </View>

      <CourseActionsSheet
        visible={actionsCourseId !== null}
        courseName={sheetCourse?.name ?? ''}
        onClose={() => setActionsCourseId(null)}
        onEdit={() => {
          if (!actionsCourseId) return;
          router.push({
            pathname: '/(tabs)/(score)/new-course',
            params: { courseId: actionsCourseId },
          });
        }}
        onDelete={() => {
          if (!actionsCourseId) return;
          if (selectedCourseId === actionsCourseId) setSelectedCourseId('');
          removeCourse(actionsCourseId);
        }}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    fixedTop: {
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    greeting: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 10,
    },
    searchBoxActive: {
      borderColor: colors.primary,
    },
    searchIcon: {
      fontSize: 13,
      color: colors.textMuted,
    },
    searchInput: {
      flex: 1,
      color: colors.textBody,
      fontSize: 14,
      padding: 0,
    },
    searchClear: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
      paddingHorizontal: 4,
    },
    tabs: {
      flexDirection: 'row',
      gap: 4,
      backgroundColor: colors.chipBg,
      borderRadius: 12,
      padding: 4,
      marginBottom: 8,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 8,
    },
    tabActive: {
      backgroundColor: colors.cardBg,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    tabTextActive: {
      color: colors.textTitle,
    },
    tabCount: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      opacity: 0.75,
    },
    tabCountActive: {
      color: colors.primaryDark,
      opacity: 0.9,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 8,
      paddingBottom: 20,
      flexGrow: 1,
    },
    courseCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderWidth: 1,
      marginBottom: 8,
      padding: 14,
      gap: 6,
    },
    courseCardSelected: {
      borderLeftColor: colors.accent,
      borderColor: colors.accent,
      backgroundColor: colors.chipBg,
    },
    courseCardBody: {
      flex: 1,
      minWidth: 0,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    courseName: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.textTitle,
    },
    courseMeta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 3,
    },
    courseRecent: {
      fontSize: 11,
      color: colors.primaryDark,
      fontWeight: '600',
      marginTop: 3,
    },
    sourceBadge: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: colors.textMuted,
      backgroundColor: colors.chipBg,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    menuBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 4,
    },
    menuBtnPressed: {
      opacity: 0.5,
    },
    menuGlyph: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: -1,
      lineHeight: 22,
    },
    emptyWrap: {
      alignItems: 'center',
      gap: 6,
      paddingTop: 48,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    emptyIcon: {
      fontSize: 36,
      marginBottom: 4,
      opacity: 0.6,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 17,
      maxWidth: 240,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 20,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 10,
    },
    createBtn: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 12,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      paddingVertical: 12,
      marginTop: 4,
    },
    createBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    nextBtn: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 22,
      paddingVertical: 14,
    },
    nextBtnDisabled: {
      opacity: 0.4,
    },
    nextBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
    },
  });
}
