/**
 * Course Selection — root of the Score tab when no round is active.
 *
 * v2 simplification: greeting prompt + single search bar + short recents
 * list. Tapping a row selects the course and navigates straight to player
 * config — no separate "Next" step. When recents exceed the inline cap, a
 * "More from recent history" button opens a bottom sheet with the full
 * list. Typing in the search bar replaces recents with live search
 * results across the entire course catalog. A "+ Create custom course"
 * row is appended as the LAST item in search results (so on no-results it
 * sits right under the search bar and funnels the user to the create
 * flow).
 *
 * Custom courses carry a ⋯ button that opens CourseActionsSheet
 * (Edit / Delete). Catalog courses are read-only.
 */

import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CourseActionsSheet } from '@/components/CourseActionsSheet';
import { RecentCoursesSheet, RecentCourseEntry } from '@/components/RecentCoursesSheet';
import { confirm } from '@/lib/dialog';
import { distanceMiles, formatMiles } from '@/lib/geo';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useLocation } from '@/state/LocationContext';
import { useTheme } from '@/state/ThemeContext';
import { Course, Round } from '@/types/golf';

const INLINE_RECENT_LIMIT = 4;

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

export default function CourseSelectionScreen() {
  const { colors } = useTheme();
  const {
    courses,
    completedRounds,
    pendingSelectedCourseId,
    setPendingSelectedCourseId,
    removeCourse,
    currentRound,
    searchCatalogCourses,
    rememberCatalogCourse,
    ensureCourseScorecard,
  } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [actionsCourseId, setActionsCourseId] = useState<string | null>(null);
  const [remoteHits, setRemoteHits] = useState<Course[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingCourseId, setLoadingCourseId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryGenRef = useRef(0);

  useScreenHeader({
    left: { kind: 'text', text: 'SCORE' },
    right: { kind: 'profile' },
  });

  // Clear any pending selection left behind by the create-course flow.
  useFocusEffect(
    useCallback(() => {
      if (pendingSelectedCourseId) {
        setQuery('');
        setPendingSelectedCourseId(null);
      }
    }, [pendingSelectedCourseId, setPendingSelectedCourseId])
  );

  // Resume an in-progress round when the Score tab gains focus.
  useFocusEffect(
    useCallback(() => {
      if (currentRound) {
        router.replace('/(tabs)/(score)/scoring');
      }
    }, [currentRound])
  );

  // Decorate + sort every locally-known course by most-recent play.
  const decoratedAll = useMemo<RecentCourseEntry[]>(() => {
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

  // Recents = locally-known courses that have actually been played + any
  // custom courses the user created (whether played yet or not). Custom
  // courses without a played round are surfaced so the user can find
  // their own creations without the search dance.
  const recents = useMemo(
    () =>
      decoratedAll.filter(
        (entry) => entry.lastPlayedAt !== null || entry.course.source === 'custom'
      ),
    [decoratedAll]
  );

  const searchActive = query.trim().length > 0;

  // Local matches (customs + already-cached opengolf rows) feed instant
  // results while the remote query is in flight. Customs the user owns
  // never appear in the remote query (RLS scopes `source = 'opengolf'`)
  // so we must overlay them locally.
  const localHits = useMemo(() => {
    if (!searchActive) return [];
    const q = query.trim().toLowerCase();
    return decoratedAll.filter((entry) =>
      [entry.course.name, entry.course.location]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q))
    );
  }, [decoratedAll, query, searchActive]);

  // Remote catalog search, debounced.
  useEffect(() => {
    if (!searchActive) {
      setRemoteHits([]);
      setSearching(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    const gen = ++queryGenRef.current;
    debounceRef.current = setTimeout(async () => {
      const results = await searchCatalogCourses(query.trim(), 25);
      if (gen !== queryGenRef.current) return; // a newer query superseded us
      setRemoteHits(results);
      setSearching(false);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchActive, searchCatalogCourses]);

  // Merge local + remote results, dedupe by course id, customs first.
  // When location coords are available we sort by distance ascending
  // (un-located courses fall to the end). Otherwise keep alpha-ish order.
  const { coords: userCoords } = useLocation();
  const distanceFor = useCallback(
    (course: Course): number | null => {
      if (!userCoords) return null;
      if (
        course.latitude == null ||
        course.longitude == null ||
        !Number.isFinite(course.latitude) ||
        !Number.isFinite(course.longitude)
      ) {
        return null;
      }
      return distanceMiles(userCoords, {
        latitude: course.latitude,
        longitude: course.longitude,
      });
    },
    [userCoords]
  );

  const searchEntries = useMemo<RecentCourseEntry[]>(() => {
    const out: RecentCourseEntry[] = [];
    const seen = new Set<string>();
    for (const entry of localHits) {
      if (seen.has(entry.course.id)) continue;
      seen.add(entry.course.id);
      out.push(entry);
    }
    for (const course of remoteHits) {
      if (seen.has(course.id)) continue;
      seen.add(course.id);
      out.push({ course, lastPlayedAt: lastPlayedAt(course.id, completedRounds) });
    }
    if (userCoords) {
      out.sort((a, b) => {
        const da = distanceFor(a.course);
        const db = distanceFor(b.course);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      });
    }
    return out;
  }, [localHits, remoteHits, completedRounds, userCoords, distanceFor]);

  const visibleList: RecentCourseEntry[] = searchActive
    ? searchEntries
    : recents.slice(0, INLINE_RECENT_LIMIT);

  // Helper: build a holes[] payload for new-course.tsx prefill (URL
  // search params support only string values, so we JSON-encode).
  function prefillParamsFor(course: Course): Record<string, string> {
    return {
      prefillName: course.name,
      prefillLocation: course.location,
      ...(course.holes.length > 0
        ? { prefillHoles: JSON.stringify(course.holes) }
        : {}),
    };
  }

  async function selectCourse(course: Course) {
    if (loadingCourseId) return; // another tap in flight

    // Custom courses are user-authored and always complete.
    if (course.source === 'custom') {
      router.push({
        pathname: '/(tabs)/(score)/players',
        params: { courseId: course.id },
      });
      return;
    }

    // Catalog row: cache + ensure we have a scorecard.
    rememberCatalogCourse(course);

    // Always route catalog picks through ensureCourseScorecard. The
    // guard inside short-circuits cheaply when the course is already
    // fully enriched (holes + tees, or holes + an attempt timestamp).
    // The old fast-path here that bypassed the guard whenever holes
    // were populated meant pre-Phase-1 catalog rows could never
    // upgrade to include tees.
    setLoadingCourseId(course.id);
    const result = await ensureCourseScorecard(course);
    setLoadingCourseId(null);

    if (!result.ok) {
      const ok = await confirm({
        title: "Couldn't load this course's scorecard",
        message: `${result.error}\n\nWould you like to create a custom version with the pars you know?`,
        confirmLabel: 'Create custom',
      });
      if (!ok) return;
      router.push({
        pathname: '/(tabs)/(score)/new-course',
        params: prefillParamsFor(course),
      });
      return;
    }

    router.push({
      pathname: '/(tabs)/(score)/players',
      params: { courseId: result.course.id },
    });
  }

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
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {!searchActive && recents.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>⛳</Text>
            <Text style={styles.emptyTitle}>No rounds played yet</Text>
            <Text style={styles.emptyBody}>
              Search for a course above to start your first round.
            </Text>
          </View>
        ) : (
          <>
            {!searchActive && recents.length > 0 && (
              <Text style={styles.sectionLabel}>RECENT</Text>
            )}
            {searchActive && (
              <Text style={styles.sectionLabel}>
                SEARCH RESULTS
                {searchEntries.length > 0 ? ` · ${searchEntries.length}` : ''}
                {searching ? ' · …' : ''}
                {userCoords && searchEntries.length > 0 ? ' · NEAREST FIRST' : ''}
              </Text>
            )}

            {visibleList.map(({ course, lastPlayedAt: lp }) => {
              const enriched = course.holes.length > 0;
              const totalPar = enriched ? course.holes.reduce((t, h) => t + h.par, 0) : null;
              const holeCountText = enriched ? `${course.holes.length} holes` : '';
              const parText = enriched && totalPar !== null ? `Par ${totalPar}` : '';
              const metaSegments = [course.location, holeCountText, parText].filter(
                (s) => s && s.length > 0
              );
              const isCustom = course.source === 'custom';
              const isLoading = loadingCourseId === course.id;
              const distanceMi = distanceFor(course);
              return (
                <Pressable
                  key={course.id}
                  onPress={() => selectCourse(course)}
                  disabled={isLoading || loadingCourseId !== null}
                  style={[styles.courseCard, isLoading && styles.courseCardLoading]}>
                  <View style={styles.courseCardBody}>
                    <View style={styles.nameRow}>
                      <Text style={styles.courseName} numberOfLines={1}>
                        {course.name}
                      </Text>
                      {isCustom && <Text style={styles.sourceBadge}>CUSTOM</Text>}
                    </View>
                    {metaSegments.length > 0 && (
                      <Text style={styles.courseMeta} numberOfLines={1}>
                        {metaSegments.join(' · ')}
                      </Text>
                    )}
                    {lp && (
                      <Text style={styles.courseRecent}>Played {formatRelative(lp)}</Text>
                    )}
                  </View>
                  {isLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      {distanceMi !== null && (
                        <Text style={styles.distanceBadge}>{formatMiles(distanceMi)}</Text>
                      )}
                      {isCustom && (
                        <Pressable
                          style={({ pressed }) => [
                            styles.menuBtn,
                            pressed && styles.menuBtnPressed,
                          ]}
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          setActionsCourseId(course.id);
                        }}
                        accessibilityLabel={`Actions for ${course.name}`}>
                        <Text style={styles.menuGlyph}>⋯</Text>
                      </Pressable>
                      )}
                    </>
                  )}
                </Pressable>
              );
            })}

            {/* Inline "more recents" — only when there are more recents than
                fit and we're not in search mode. */}
            {!searchActive && recents.length > INLINE_RECENT_LIMIT && (
              <Pressable style={styles.moreBtn} onPress={() => setDrawerOpen(true)}>
                <Text style={styles.moreBtnText}>
                  More from recent history ▾
                </Text>
              </Pressable>
            )}

            {/* Create-custom-course CTA — only renders while searching. Lives
                as the LAST entry in the result list so that on no-results it
                sits right under the search bar and funnels the user
                straight into the create flow. */}
            {searchActive && (
              <Link
                href={{
                  pathname: '/(tabs)/(score)/new-course',
                  params: { prefillName: query.trim() },
                }}
                asChild>
                <Pressable style={styles.createBtn}>
                  <Text style={styles.createBtnText}>
                    + Create "{query.trim()}" as a custom course
                  </Text>
                </Pressable>
              </Link>
            )}
          </>
        )}
      </ScrollView>

      <RecentCoursesSheet
        visible={drawerOpen}
        entries={recents}
        onClose={() => setDrawerOpen(false)}
        onSelect={(courseId) => {
          const found = recents.find((e) => e.course.id === courseId)?.course;
          if (found) selectCourse(found);
        }}
      />

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
      letterSpacing: 0.5,
      marginBottom: 4,
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
      marginBottom: 4,
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 14,
      paddingBottom: 32,
      flexGrow: 1,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 8,
      marginLeft: 2,
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
    courseCardLoading: {
      opacity: 0.7,
    },
    distanceBadge: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primaryDark,
      marginLeft: 6,
      minWidth: 36,
      textAlign: 'right',
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
    moreBtn: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1,
      paddingVertical: 11,
      marginTop: 4,
    },
    moreBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
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
  });
}
