/**
 * Search tab — People (friend search, requests, friends list) and Courses
 * (searchable course catalog → course detail), switched by a segmented toggle.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { Avatar, GlassCard, GlassSurface, PHONE_MAX_WIDTH, SectionLabel, SegmentedToggle } from '@/components/aurora';
import { AddCourseRow } from '@/components/course/AddCourseRow';
import { CourseRow } from '@/components/scoring/CourseRow';
import { FriendActionPill } from '@/components/social/FriendActionPill';
import { IncomingRequestsBanner } from '@/components/social/IncomingRequestsBanner';
import { SearchResultsRow } from '@/components/social/SearchResultsRow';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useCoursesSearch } from '@/library/golf/useCourses';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useScorecardStats } from '@/library/golf/useScorecardStats';
import { useFriends } from '@/library/social/FriendsContext';
import { warmProfileCache } from '@/library/social/profileCache';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Course } from '@/types/golf';
import type { ProfileSummary } from '@/types/social';

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 250;

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    searchProfiles,
    friends,
    incomingRequests,
    outgoingRequests,
    hydrated
  } = useFriends();
  const { roundsTogether } = useScorecardStats();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = React.useState('');
  const [tab, setTab] = React.useState<'people' | 'courses'>('people');
  const [results, setResults] = React.useState<ProfileSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const participantKeys = React.useMemo(
    () => friends.map(userParticipantKey),
    [friends]
  );
  const resolver = useParticipantResolver(participantKeys);

  const friendRows = React.useMemo(() => {
    const rows = friends.map((userId) => {
      const resolved = resolver.get(userParticipantKey(userId));
      return {
        userId,
        displayName: resolved?.displayName || 'Player',
        handle: resolved?.handle,
        avatarColor: resolved?.avatarColor || colors.cyan,
        together: roundsTogether(userId)
      };
    });
    rows.sort((a, b) => {
      const cmp = a.displayName.localeCompare(b.displayName);
      if (cmp !== 0) return cmp;
      return (a.handle ?? '').localeCompare(b.handle ?? '');
    });
    return rows;
  }, [friends, resolver, roundsTogether, colors.cyan]);

  const onChangeQuery = React.useCallback((next: string) => {
    setQuery(next);
    if (next.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      setError(null);
      setLoading(false);
      requestIdRef.current += 1;
    }
  }, []);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      return;
    }

    const myRequestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await searchProfiles(trimmed);
        if (myRequestId !== requestIdRef.current) return;
        warmProfileCache(rows);
        setResults(rows);
      } catch (err: any) {
        if (myRequestId !== requestIdRef.current) return;
        console.warn('[search] searchProfiles failed:', err);
        setError(err?.message ?? 'Could not load results.');
        setResults([]);
      } finally {
        if (myRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, searchProfiles]);

  const onRowPress = React.useCallback(
    (profile: ProfileSummary) => {
      router.push(`/(tabs)/(search)/profile/${profile.userId}` as never);
    },
    [router]
  );

  const trimmed = query.trim();
  const isSearching = trimmed.length >= MIN_QUERY_LEN;
  const showNoResults = isSearching && !loading && !error && results.length === 0;
  const incomingRequestCount = incomingRequests.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <SegmentedToggle
        options={[
          { key: 'people', label: 'People' },
          { key: 'courses', label: 'Courses' }
        ]}
        value={tab}
        onChange={setTab}
        style={styles.toggle}
      />
      {tab === 'courses' ? (
        <CoursesPane styles={styles} colors={colors} />
      ) : (
        <>
      <GlassSurface strong glow style={styles.searchField}>
        <Ionicons name="search" size={18} color={colors.cyan} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onChangeQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search @handle"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => onChangeQuery('')} hitSlop={8}>
            <Text style={styles.clearLink}>Clear</Text>
          </Pressable>
        ) : null}
      </GlassSurface>

      {isSearching ? (
        <>
          <SectionLabel right={loading ? <ActivityIndicator color={colors.lime} /> : null}>
            People
          </SectionLabel>

          {error ? (
            <GlassCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.accent }]}>{error}</Text>
            </GlassCard>
          ) : null}

          {showNoResults ? (
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyText}>No one matches “{trimmed}”.</Text>
            </GlassCard>
          ) : null}

          {results.map((p) => (
            <SearchResultsRow key={p.userId} profile={p} onPress={onRowPress} />
          ))}
        </>
      ) : (
        <>
          <SectionLabel
            right={
              incomingRequestCount > 0
                ? <Text style={styles.sectionMeta}>{incomingRequestCount} incoming</Text>
                : null
            }>
            Requests
          </SectionLabel>
          <IncomingRequestsBanner />
          {outgoingRequests.map((req) => {
            const profile: ProfileSummary = {
              userId: req.toUserId,
              handle: req.toHandle,
              displayName: req.toDisplayName || req.toHandle || 'Player',
              avatarColor: req.toAvatarColor || colors.violet
            };
            return (
              <GlassCard key={req.id} padded={false} style={styles.requestRow}>
                <Avatar
                  initial={profile.displayName || profile.handle}
                  color={profile.avatarColor}
                  size={38}
                  circle
                />
                <View style={styles.rowBody}>
                  <Text style={styles.handle} numberOfLines={1}>@{profile.handle}</Text>
                  <Text style={styles.subtext} numberOfLines={1}>you sent a request</Text>
                </View>
                <FriendActionPill target={profile} />
              </GlassCard>
            );
          })}
          {hydrated && outgoingRequests.length === 0 ? (
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>No pending outgoing requests.</Text>
            </GlassCard>
          ) : null}

          <SectionLabel right={<Text style={styles.sectionMeta}>{friends.length}</Text>}>
            Your friends
          </SectionLabel>
          {hydrated && friends.length === 0 ? (
            <GlassCard strong glow style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyText}>
                Search by @handle above and send your first request.
              </Text>
            </GlassCard>
          ) : null}
          {friendRows.map((row) => {
            const meta = row.together > 0
              ? `${row.displayName} · ${row.together} ${row.together === 1 ? 'round' : 'rounds'}`
              : row.displayName;
            return (
              <Pressable
                key={row.userId}
                style={({ pressed }) => [styles.friendPress, pressed && styles.pressed]}
                onPress={() => router.push(`/(tabs)/(search)/profile/${row.userId}` as never)}>
                <GlassCard padded={false} style={styles.friendRow}>
                  <Avatar
                    initial={row.displayName}
                    color={row.avatarColor}
                    size={40}
                    circle
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.handle} numberOfLines={1}>
                      {row.handle ? `@${row.handle}` : row.displayName}
                    </Text>
                    <Text style={styles.subtext} numberOfLines={1}>{meta}</Text>
                  </View>
                  <Text style={styles.viewLink}>View ›</Text>
                </GlassCard>
              </Pressable>
            );
          })}
        </>
      )}
        </>
      )}
    </ScrollView>
  );
}

/** Secondary line for a course search result: location · par · tee count (only the parts we have). */
function courseRowDetail(course: Course): string | undefined {
  const parts: string[] = [];
  if (course.location) parts.push(course.location);
  const par = course.holes.reduce((sum, h) => sum + h.par, 0);
  if (par > 0) parts.push(`par ${par}`);
  const teeCount = course.tees?.length ?? 0;
  if (teeCount > 0) parts.push(`${teeCount} ${teeCount === 1 ? 'tee' : 'tees'}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

type SearchStyles = ReturnType<typeof makeStyles>;

function CoursesPane({
  styles,
  colors
}: {
  styles: SearchStyles;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const { courses, loading, error } = useCoursesSearch(query);

  const trimmed = query.trim();
  const showNoResults = trimmed.length > 0 && !loading && !error && courses.length === 0;

  return (
    <>
      <GlassSurface strong glow style={styles.searchField}>
        <Ionicons name="search" size={18} color={colors.cyan} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search courses"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        {loading ? (
          <ActivityIndicator color={colors.lime} />
        ) : query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.clearLink}>Clear</Text>
          </Pressable>
        ) : null}
      </GlassSurface>

      {trimmed.length === 0 ? (
        <GlassCard strong glow style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Search the catalog</Text>
          <Text style={styles.emptyText}>
            Find any course by name to see its tees, ratings, and full scorecard.
          </Text>
        </GlassCard>
      ) : (
        <>
          <SectionLabel
            right={
              loading ? (
                <ActivityIndicator color={colors.lime} />
              ) : courses.length > 0 ? (
                <Text style={styles.sectionMeta}>
                  {courses.length} {courses.length === 1 ? 'match' : 'matches'}
                </Text>
              ) : null
            }>
            Courses
          </SectionLabel>

          {error ? (
            <GlassCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.accent }]}>{error}</Text>
            </GlassCard>
          ) : null}

          {showNoResults ? (
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyText}>No courses match “{trimmed}”.</Text>
            </GlassCard>
          ) : null}

          <View style={styles.courseList}>
            {courses.map((course) => (
              <CourseRow
                key={course.id}
                course={course}
                detail={courseRowDetail(course)}
                onPress={() =>
                  router.push(`/(tabs)/(search)/course/${course.id}` as never)
                }
              />
            ))}
          </View>
        </>
      )}

      <View style={styles.addCourseEntry}>
        <AddCourseRow onPress={() => router.push('/(tabs)/(search)/course/add' as never)} />
      </View>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent'
    },
    content: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      padding: 20,
      paddingBottom: 48
    },
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 22,
      paddingHorizontal: 14,
      height: 52,
      marginBottom: 8
    },
    toggle: {
      marginBottom: 12
    },
    courseList: {
      gap: 10
    },
    addCourseEntry: {
      marginTop: 12
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.textTitle,
      padding: 0
    },
    clearLink: {
      color: colors.lime,
      fontSize: 12,
      fontWeight: '800'
    },
    sectionMeta: {
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    },
    emptyCard: {
      marginBottom: 10,
      alignItems: 'center'
    },
    emptyTitle: {
      color: colors.textTitle,
      fontSize: 15,
      fontWeight: '900',
      marginBottom: 4
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center'
    },
    requestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      marginBottom: 8
    },
    friendPress: {
      marginBottom: 8
    },
    friendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12
    },
    pressed: {
      opacity: 0.82,
      transform: [{ scale: 0.99 }]
    },
    rowBody: {
      flex: 1,
      minWidth: 0
    },
    handle: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '900'
    },
    subtext: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2
    },
    viewLink: {
      color: colors.lime,
      fontSize: 12,
      fontWeight: '900'
    }
  });
}
