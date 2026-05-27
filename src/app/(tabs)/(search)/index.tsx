/**
 * Search tab — find people by @handle.
 *
 * Behavior:
 *   · Input debounced 250ms (matches the plan).
 *   · Min 2 chars before firing — short queries are useless for prefix
 *     match and would just thrash the server.
 *   · Server-side prefix search via FriendsContext.searchProfiles
 *     (which escapes `%`/`_` and uses the `text_pattern_ops` index).
 *   · Results warm the in-memory profile cache so tapping a row opens
 *     the profile screen instantly without a second fetch.
 *
 * Future: COURSES section below PEOPLE. Hidden in v1.
 */

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
import { useRouter } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';
import { useFriends } from '@/library/social/FriendsContext';
import { warmProfileCache } from '@/library/social/profileCache';
import { SearchResultsRow } from '@/components/social/SearchResultsRow';
import type { ProfileSummary } from '@/types/social';

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 250;

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { searchProfiles } = useFriends();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<ProfileSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  // Synchronous clear when the query drops below the min length. Done
  // in the change handler (not the effect) so we don't trip the React 19
  // set-state-in-effect rule — the effect below only triggers async work.
  const onChangeQuery = React.useCallback((next: string) => {
    setQuery(next);
    if (next.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      setError(null);
      setLoading(false);
      // Invalidate any in-flight debounced request so a late response
      // from a previous longer query can't repopulate the empty state.
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
      // Both setStates are inside the timer callback (microtask later),
      // so they don't count as synchronous setState within the effect.
      setLoading(true);
      setError(null);
      try {
        const rows = await searchProfiles(trimmed);
        // Race guard: only commit if no newer query has fired since.
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
      router.push(`/(tabs)/(search)/profile/${profile.userId}`);
    },
    [router]
  );

  const trimmed = query.trim();
  const showEmptyHint = trimmed.length < MIN_QUERY_LEN;
  const showNoResults = !showEmptyHint && !loading && !error && results.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.lede}>Find friends by their @handle.</Text>

      <View style={styles.searchField}>
        <Text style={styles.searchAt}>@</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onChangeQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="search by handle"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => onChangeQuery('')} hitSlop={8}>
            <Text style={styles.clearLink}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>PEOPLE</Text>

      {showEmptyHint ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Start typing to search.</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.accent }]}>
            {error}
          </Text>
        </View>
      ) : null}

      {showNoResults ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No one matches “{trimmed}”.</Text>
        </View>
      ) : null}

      {results.map((p) => (
        <SearchResultsRow key={p.userId} profile={p} onPress={onRowPress} />
      ))}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      padding: 20,
      paddingBottom: 48
    },
    lede: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 16
    },
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      marginBottom: 22
    },
    searchAt: {
      color: colors.textMuted,
      fontWeight: '600',
      fontSize: 16,
      marginRight: 4
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.textTitle
    },
    clearLink: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600'
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textMuted,
      marginBottom: 10
    },
    emptyWrap: {
      paddingVertical: 36,
      alignItems: 'center'
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: 'center'
    },
    loadingWrap: {
      paddingVertical: 24,
      alignItems: 'center'
    }
  });
}
