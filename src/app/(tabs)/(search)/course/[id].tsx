/**
 * Course detail — full course info for a catalog course, reached from the
 * Search tab's Courses results.
 *
 * Loads via `useCourse(id)`, the same hook the new-round picker uses: it
 * fetches the `public.courses` row and, when the row hasn't been enriched
 * yet, lazily pulls the full scorecard from the OpenGolfAPI and writes it
 * back to the shared catalog row (see `library/golf/courseEnrichment`). So
 * opening a course here hydrates the same rich par / yardage / stroke-index
 * data that scoring relies on.
 *
 * Read-only: a hero (par · total yardage · headline rating/slope), the tee
 * sets with their ratings, and a hole-by-hole scorecard (Par / Yds / Hcp).
 */

import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard, NumericText, PHONE_MAX_WIDTH, SectionLabel } from '@/components/aurora';
import { assignTeeColors } from '@/library/golf/teeColor';
import { getHoleStats } from '@/library/golf/teeGrouping';
import { useCourse } from '@/library/golf/useCourses';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Course, Hole, Tee } from '@/types/golf';

/** Headline tee: the longest tee that carries both a rating and a slope, else the longest, else the first. */
function pickDefaultTee(tees: Tee[] | undefined): Tee | null {
  if (!tees || tees.length === 0) return null;
  const rated = tees.filter((t) => t.rating != null && t.slope != null);
  const pool = rated.length > 0 ? rated : tees;
  return pool.reduce(
    (best, t) => ((t.totalYardage ?? 0) > (best.totalYardage ?? 0) ? t : best),
    pool[0]
  );
}

function statFor(tee: Tee | null, hole: Hole) {
  if (tee) return getHoleStats(tee, hole.number, hole);
  return {
    holeNumber: hole.number,
    par: hole.par,
    handicapIndex: hole.handicapIndex,
    yardage: hole.yardage
  };
}

function formatYards(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function ratingSlope(tee: Tee): string {
  if (tee.rating == null || tee.slope == null) return '—';
  return `${tee.rating.toFixed(1)} / ${tee.slope}`;
}

function chunkNines(holes: Hole[]): Hole[][] {
  const sorted = [...holes].sort((a, b) => a.number - b.number);
  const out: Hole[][] = [];
  for (let i = 0; i < sorted.length; i += 9) out.push(sorted.slice(i, i + 9));
  return out;
}

export default function CourseDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { course, loading, enriching, error } = useCourse(id);
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  return (
    <>
      <Stack.Screen options={{ title: course?.name ?? 'Course' }} />
      <View style={styles.container}>
        <View style={styles.content}>
          {course ? (
            <CourseBody course={course} styles={styles} colors={colors} />
          ) : loading || enriching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.lime} />
            </View>
          ) : (
            <GlassCard style={styles.empty}>
              <Text style={styles.emptyIcon}>⛳</Text>
              <Text style={styles.emptyTitle}>Course unavailable</Text>
              <Text style={styles.emptyBody}>
                {error ?? 'We couldn’t load this course. Try again from search.'}
              </Text>
            </GlassCard>
          )}
        </View>
      </View>
    </>
  );
}

type CourseStyles = ReturnType<typeof makeStyles>;

function CourseBody({
  course,
  styles,
  colors
}: {
  course: Course;
  styles: CourseStyles;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const tees = React.useMemo(() => course.tees ?? [], [course.tees]);
  const defaultTee = pickDefaultTee(tees);
  const teeColors = React.useMemo(() => assignTeeColors(tees), [tees]);
  const orderedTees = React.useMemo(
    () => [...tees].sort((a, b) => (b.totalYardage ?? 0) - (a.totalYardage ?? 0)),
    [tees]
  );

  // The scorecard can be viewed for any tee; the hero stays the headline tee.
  const [selectedTeeId, setSelectedTeeId] = React.useState<string | undefined>(undefined);
  const selectedTee = orderedTees.find((t) => t.id === selectedTeeId) ?? defaultTee;

  const totalPar = course.holes.reduce((sum, h) => sum + h.par, 0);

  const teeTotalYards = (tee: Tee | null): number | undefined => {
    const summed = course.holes.reduce((sum, h) => {
      const y = statFor(tee, h).yardage;
      return y != null && y > 0 ? sum + y : sum;
    }, 0);
    return tee?.totalYardage ?? (summed > 0 ? summed : undefined);
  };
  const heroYards = teeTotalYards(defaultTee);
  const scorecardYards = teeTotalYards(selectedTee);

  const nines = chunkNines(course.holes);

  return (
    <>
      <GlassCard style={styles.hero}>
        <Text style={styles.courseName}>{course.name}</Text>
        {course.location ? <Text style={styles.courseSub}>{course.location}</Text> : null}
        <View style={styles.heroRow}>
          <NumericText style={styles.heroValue}>{totalPar > 0 ? totalPar : '—'}</NumericText>
          <Text style={styles.heroLabel}>Par{'\n'}{formatYards(heroYards)} yds</Text>
          <View style={styles.quick}>
            <View style={styles.quickTile}>
              <NumericText style={styles.quickValue}>
                {defaultTee?.rating != null ? defaultTee.rating.toFixed(1) : '—'}
              </NumericText>
              <Text style={styles.quickLabel}>RATING</Text>
            </View>
            <View style={styles.quickTile}>
              <NumericText style={styles.quickValue}>{defaultTee?.slope ?? '—'}</NumericText>
              <Text style={styles.quickLabel}>SLOPE</Text>
            </View>
          </View>
        </View>
      </GlassCard>

      {orderedTees.length > 0 ? (
        <>
          <SectionLabel
            right={
              <Text style={styles.labelRight}>
                {orderedTees.length} {orderedTees.length === 1 ? 'set' : 'sets'}
              </Text>
            }>
            Tees
          </SectionLabel>
          <GlassCard style={styles.card}>
            {orderedTees.map((tee, idx) => {
              const token = teeColors.get(tee.id);
              const dotColor = token ? colors[token] : colors.textMuted;
              const active = tee.id === selectedTee?.id;
              return (
                <Pressable
                  key={tee.id}
                  onPress={() => setSelectedTeeId(tee.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.teeRow,
                    active
                      ? styles.teeRowActive
                      : idx < orderedTees.length - 1
                        ? styles.rowDivider
                        : null,
                    pressed ? styles.teeRowPressed : null,
                  ]}>
                  <View style={[styles.teeDot, { backgroundColor: dotColor }]} />
                  <Text
                    style={[styles.teeName, active ? styles.teeNameActive : null]}
                    numberOfLines={1}>
                    {tee.name}
                  </Text>
                  <Text style={styles.teeRating}>{ratingSlope(tee)}</Text>
                  <NumericText style={styles.teeYards}>{formatYards(tee.totalYardage)} yds</NumericText>
                  {active ? <Text style={styles.teeCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </GlassCard>
        </>
      ) : null}

      {course.holes.length > 0 ? (
        <>
          <SectionLabel
            right={
              selectedTee ? <Text style={styles.labelRight}>{selectedTee.name}</Text> : null
            }>
            Scorecard
          </SectionLabel>
          <GlassCard style={styles.card}>
            {nines.map((nine, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 ? <View style={styles.nineDivider} /> : null}
                <ScorecardNine holes={nine} tee={selectedTee} styles={styles} />
              </React.Fragment>
            ))}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsText}>
                Par <Text style={styles.totalsStrong}>{totalPar}</Text>
              </Text>
              <Text style={styles.totalsYards}>{formatYards(scorecardYards)} yds</Text>
            </View>
          </GlassCard>
        </>
      ) : null}
    </>
  );
}

function ScorecardNine({
  holes,
  tee,
  styles
}: {
  holes: Hole[];
  tee: Tee | null;
  styles: CourseStyles;
}) {
  const stats = holes.map((h) => statFor(tee, h));
  return (
    <View>
      <View style={styles.gridRow}>
        <Text style={styles.gridLabel}>Hole</Text>
        {stats.map((s) => (
          <Text key={s.holeNumber} style={styles.gridHead}>
            {s.holeNumber}
          </Text>
        ))}
      </View>
      <View style={styles.gridRow}>
        <Text style={styles.gridLabel}>Par</Text>
        {stats.map((s) => (
          <Text key={s.holeNumber} style={styles.gridPar}>
            {s.par}
          </Text>
        ))}
      </View>
      <View style={styles.gridRow}>
        <Text style={styles.gridLabel}>Yds</Text>
        {stats.map((s) => (
          <Text key={s.holeNumber} style={styles.gridCell}>
            {s.yardage != null && s.yardage > 0 ? s.yardage : '—'}
          </Text>
        ))}
      </View>
      <View style={styles.gridRow}>
        <Text style={styles.gridLabel}>Hcp</Text>
        {stats.map((s) => (
          <Text key={s.holeNumber} style={styles.gridCell}>
            {s.handicapIndex ?? '—'}
          </Text>
        ))}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent'
    },
    content: {
      flex: 1,
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      padding: 20,
      paddingBottom: 48
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center'
    },

    hero: {
      borderRadius: 22,
      marginBottom: 13
    },
    courseName: {
      color: colors.textTitle,
      fontSize: 19,
      fontWeight: '800'
    },
    courseSub: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600'
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.glassStroke
    },
    heroValue: {
      color: colors.cyan,
      fontSize: 46,
      fontWeight: '900',
      lineHeight: 46
    },
    heroLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      lineHeight: 17
    },
    quick: {
      marginLeft: 'auto',
      flexDirection: 'row',
      gap: 8
    },
    quickTile: {
      minWidth: 56,
      alignItems: 'center',
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10
    },
    quickValue: {
      color: colors.textTitle,
      fontSize: 15,
      fontWeight: '800'
    },
    quickLabel: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1
    },

    labelRight: {
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5
    },

    card: {
      borderRadius: 20,
      marginBottom: 13
    },

    teeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 11,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent'
    },
    rowDivider: {
      borderRadius: 0,
      borderBottomColor: colors.glassStroke
    },
    teeRowActive: {
      backgroundColor: colors.glowLime,
      borderColor: colors.lime
    },
    teeRowPressed: {
      opacity: 0.7
    },
    teeDot: {
      width: 12,
      height: 12,
      borderRadius: 6
    },
    teeName: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '700',
      minWidth: 50
    },
    teeNameActive: {
      color: colors.lime
    },
    teeRating: {
      marginLeft: 'auto',
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600'
    },
    teeYards: {
      minWidth: 78,
      textAlign: 'right',
      color: colors.textBody,
      fontSize: 13,
      fontWeight: '700'
    },
    teeCheck: {
      color: colors.lime,
      fontSize: 14,
      fontWeight: '800'
    },

    gridRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4
    },
    gridLabel: {
      width: 34,
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase'
    },
    gridHead: {
      flex: 1,
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '700'
    },
    gridPar: {
      flex: 1,
      textAlign: 'center',
      color: colors.textBody,
      fontSize: 12,
      fontWeight: '700'
    },
    gridCell: {
      flex: 1,
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600'
    },
    nineDivider: {
      height: 1,
      backgroundColor: colors.glassStroke,
      marginVertical: 7
    },
    totalsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 9,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.glassStroke
    },
    totalsText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600'
    },
    totalsStrong: {
      color: colors.textTitle,
      fontWeight: '800'
    },
    totalsYards: {
      color: colors.lime,
      fontSize: 12,
      fontWeight: '800'
    },

    empty: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 28
    },
    emptyIcon: {
      fontSize: 34,
      opacity: 0.5
    },
    emptyTitle: {
      color: colors.textTitle,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center'
    },
    emptyBody: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 19,
      textAlign: 'center',
      maxWidth: 280
    }
  });
}
