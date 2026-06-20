/**
 * Handicap detail — shows how the signed-in user's approximate World
 * Handicap System index is computed: the counting score differentials, the
 * resulting average, and the rounds excluded (with a reason) for missing
 * data. Reached from the Handicap tile on the You profile.
 *
 * Self-contained: it recomputes the breakdown from `useCompletedRounds`
 * (owner-scoped) via `library/golf/handicap`, so it stays in sync with the
 * profile tile without prop plumbing.
 */

import React from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GlassCard, NumericText, PHONE_MAX_WIDTH, SectionLabel } from '@/components/aurora';
import { PullToRefreshScrollView } from '@/components/widgets/PullToRefreshScrollView';
import { useRefresh } from '@/library/data/useRefresh';
import {
  computeWhsHandicap,
  exclusionLabel,
  type EligibleHandicapRound,
  type ExcludedHandicapRound
} from '@/library/golf/handicap';
import { useCompletedRounds } from '@/library/golf/useCompletedRounds';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function HandicapScreen() {
  const { colors } = useTheme();
  const account = useRequiredAccount();
  const { rounds, isLoading } = useCompletedRounds();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const refresh = useRefresh();

  const breakdown = React.useMemo(
    () => computeWhsHandicap(rounds, account.userId),
    [rounds, account.userId]
  );

  const hasIndex = breakdown.index != null;
  const hasEligible = breakdown.window.length > 0;
  const remaining = Math.max(0, 3 - breakdown.window.length);

  return (
    <>
      <Stack.Screen options={{ title: 'Handicap' }} />
      <PullToRefreshScrollView
        onRefresh={refresh}
        style={styles.container}
        contentContainerStyle={styles.content}>
        <GlassCard style={styles.hero}>
          <View style={styles.heroRow}>
            <NumericText style={styles.heroValue}>{breakdown.indexLabel}</NumericText>
            <Text style={styles.heroLabel}>Handicap{'\n'}index</Text>
            <View style={styles.quick}>
              <View style={styles.quickTile}>
                <NumericText style={styles.quickValue}>{breakdown.usedCount}</NumericText>
                <Text style={styles.quickLabel}>COUNTING</Text>
              </View>
              <View style={styles.quickTile}>
                <NumericText style={styles.quickValue}>{breakdown.window.length}</NumericText>
                <Text style={styles.quickLabel}>ELIGIBLE</Text>
              </View>
            </View>
          </View>
          <Text style={styles.explain}>
            World Handicap System: the average of your best differentials from your most recent 20
            rounds (fewer while you build up). Each differential is (113 ÷ Slope) × (Adjusted Gross −
            Course Rating), with every hole capped at net double bogey. An approximation — no
            playing-conditions or cap adjustments yet.
          </Text>
          <Text style={styles.formula}>
            Differential = (113 ÷ Slope) × (Adjusted Gross − Course Rating)
          </Text>
        </GlassCard>

        {hasEligible ? (
          <>
            <SectionLabel
              right={
                <Text style={styles.labelRight}>
                  {hasIndex
                    ? `Lowest ${breakdown.usedCount} of ${breakdown.window.length}`
                    : `${remaining} more to start`}
                </Text>
              }>
              {hasIndex ? 'Counting differentials' : 'Eligible rounds'}
            </SectionLabel>

            {breakdown.window.map((row) => (
              <DifferentialRow key={row.round.id} row={row} styles={styles} />
            ))}

            {hasIndex ? (
              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>
                  Average of lowest {breakdown.usedCount} of {breakdown.window.length}
                </Text>
                <NumericText style={styles.summaryValue}>{breakdown.indexLabel}</NumericText>
              </View>
            ) : (
              <Text style={styles.note}>
                You need at least 3 eligible rounds to establish an index. Play {remaining} more
                full 18-hole stroke-play round{remaining === 1 ? '' : 's'} from a rated tee.
              </Text>
            )}
          </>
        ) : isLoading ? (
          <GlassCard style={styles.empty}>
            <ActivityIndicator color={colors.lime} />
          </GlassCard>
        ) : (
          <GlassCard style={styles.empty}>
            <Text style={styles.emptyIcon}>⛳</Text>
            <Text style={styles.emptyTitle}>Not enough rated rounds yet</Text>
            <Text style={styles.emptyBody}>
              Your index needs full 18-hole stroke-play rounds played from a tee that has a course
              rating and slope. Score a few and they&apos;ll show up here.
            </Text>
          </GlassCard>
        )}

        {breakdown.excluded.length > 0 ? (
          <>
            <SectionLabel right={<Text style={styles.labelRight}>missing data</Text>}>
              Not counted
            </SectionLabel>
            {breakdown.excluded.map((row) => (
              <ExcludedRow key={row.round.id} row={row} styles={styles} />
            ))}
          </>
        ) : null}
      </PullToRefreshScrollView>
    </>
  );
}

type HandicapStyles = ReturnType<typeof makeStyles>;

function DifferentialRow({ row, styles }: { row: EligibleHandicapRound; styles: HandicapStyles }) {
  return (
    <GlassCard padded={false} style={styles.row}>
      <NumericText style={[styles.diff, row.counts ? styles.diffCounts : null]}>
        {row.differential.toFixed(1)}
      </NumericText>
      <View style={styles.rowBody}>
        <Text style={styles.rowCourse} numberOfLines={1}>
          {row.round.course.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          AGS {row.adjustedGross} · {row.rating.toFixed(1)}/{row.slope}
        </Text>
      </View>
      <Text style={styles.rowDate}>{formatShortDate(row.date)}</Text>
    </GlassCard>
  );
}

function ExcludedRow({ row, styles }: { row: ExcludedHandicapRound; styles: HandicapStyles }) {
  return (
    <GlassCard padded={false} style={styles.row}>
      <Text style={styles.diffEmpty}>—</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowCourse} numberOfLines={1}>
          {row.round.course.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {exclusionLabel(row.reason)}
        </Text>
      </View>
      <Text style={styles.rowDate}>{formatShortDate(row.date)}</Text>
    </GlassCard>
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

    hero: {
      borderRadius: 24,
      marginBottom: 4
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12
    },
    heroValue: {
      color: colors.lime,
      fontSize: 46,
      fontWeight: '900',
      lineHeight: 48
    },
    heroLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 16
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
      fontSize: 16,
      fontWeight: '800'
    },
    quickLabel: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1
    },
    explain: {
      marginTop: 14,
      paddingTop: 13,
      borderTopWidth: 1,
      borderTopColor: colors.glassStroke,
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18
    },
    formula: {
      marginTop: 10,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 11,
      color: colors.cyan,
      fontSize: 11.5,
      fontWeight: '600'
    },

    labelRight: {
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingHorizontal: 15,
      paddingVertical: 13,
      marginBottom: 11,
      borderRadius: 18
    },
    diff: {
      minWidth: 48,
      color: colors.textTitle,
      fontSize: 24,
      fontWeight: '900'
    },
    diffCounts: {
      color: colors.lime
    },
    diffEmpty: {
      minWidth: 48,
      color: colors.textMuted,
      fontSize: 24,
      fontWeight: '900'
    },
    rowBody: {
      flex: 1,
      minWidth: 0
    },
    rowCourse: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '800'
    },
    rowMeta: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600'
    },
    rowDate: {
      marginLeft: 'auto',
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700'
    },

    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.glowLime,
      borderWidth: 1,
      borderColor: colors.lime,
      borderRadius: 16,
      paddingHorizontal: 15,
      paddingVertical: 13,
      marginTop: 2,
      marginBottom: 6
    },
    summaryLabel: {
      flex: 1,
      color: colors.textBody,
      fontSize: 12,
      fontWeight: '600'
    },
    summaryValue: {
      color: colors.lime,
      fontSize: 18,
      fontWeight: '900'
    },
    note: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
      marginBottom: 6,
      marginHorizontal: 4
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
