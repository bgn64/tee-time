/**
 * ScoringRoundView — the shared full-screen editing surface for both
 * the live-scoring screen and the completed-round edit screen.
 *
 * Edge-to-edge (no card), mirroring the feed card's chrome but for
 * editing (mockups `scoring-banner.html`,
 * `scoring-screen-redesign.html`, `edit-round-screen-redesign.html`):
 *
 *   [compact info bar]           course + format / round tee / autosave
 *   [hole hero]                  focused hole number, meta, running score
 *   [SwipeableHoleEditor]        per-hole editing surface + prev/next nav
 *   [footer]
 *     primary button             optional — "Finish round" on live
 *                                scoring; omitted on edit (Done is in
 *                                the header there)
 *
 * The route owns the native stack header (back + title + ⋯ overflow for
 * the destructive Abandon/Delete), the destructive confirm, and the
 * score write wiring (passed in as callbacks). This component owns the
 * course info, hole hero, editor, and footer CTA.
 */

import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LensSwitcher, type ScoringLens } from './LensSwitcher';
import { SwipeableHoleEditor } from './SwipeableHoleEditor';
import { GlassCard, NeonButton, NumericText } from '@/components/aurora';
import { findTee } from '@/library/golf/courseHelpers';
import { formatScore, getScorerProgress } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  profileRoutePrefix: string;
  currentHoleNumber: number;
  onChangeCurrentHole: (n: number) => void;
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
  onPressTeeForScorer?: (scorerId: string) => void;
  /**
   * Footer primary button, e.g. "Finish round" on the live-scoring
   * screen. Omit both to hide the footer primary entirely (the
   * edit-round screen does this — its "Done" lives in the header).
   */
  primaryLabel?: string;
  onPrimary?: () => void;
  /**
   * Inline destructive link rendered under the primary button — the
   * live-scoring screen wires "Abandon round" here (mockup
   * `04-aurora-glass.html`, the `.abandon` link beneath Finish). Omit
   * both to hide it; the edit-round screen keeps Delete in its header
   * instead.
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /**
   * Live-scoring lens system (mockup `04-aurora-glass.html`): when
   * `onChangeLens` is provided, the header shows a Hole · Card · Chat
   * switcher and the `card`/`chat` lenses swap the Hole body for the
   * injected `cardLens` / `chatLens`. The edit-round screen omits these
   * and keeps the plain Hole surface.
   */
  lens?: ScoringLens;
  onChangeLens?: (lens: ScoringLens) => void;
  cardLens?: ReactNode;
  chatLens?: ReactNode;
};

export function ScoringRoundView({
  round,
  currentHoleNumber,
  onChangeCurrentHole,
  onChangeScore,
  onPressTeeForScorer,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  lens,
  onChangeLens,
  cardLens,
  chatLens,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const activeLens: ScoringLens = lens ?? 'hole';
  const showSwitcher = onChangeLens != null;

  const isInProgress = !round.completedAt;
  const currentHole = round.course.holes.find((h) => h.number === currentHoleNumber);
  const primaryScorerId =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0
      ? round.teams?.[0]?.id
      : round.playerIds[0];
  const progress = getScorerProgress(round, primaryScorerId);
  const formatLabel = round.scoringRule === 'scramble' ? 'Scramble' : 'Stroke';
  const firstParticipantKey =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0
      ? round.teams?.[0]?.playerIds[0]
      : round.playerIds[0];
  const roundTee = findTee(
    round.course,
    round.participants.find((p) => p.participantKey === firstParticipantKey)?.teeId
  );
  const teeLine = roundTee
    ? `${roundTee.name}${roundTee.totalYardage ? ` ${roundTee.totalYardage.toLocaleString()}y` : ''}`
    : 'No tee';
  const metaLine = `${formatLabel} · ${teeLine} · ${isInProgress ? 'autosaving' : 'saved'} ●`;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 14 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <GlassCard strong glow style={styles.headerCard}>
            <View style={styles.infoBar}>
              <Text style={styles.infoCourse} numberOfLines={1}>
                {round.course.name}
              </Text>
              <Text style={styles.infoMeta} numberOfLines={1}>
                {metaLine}
              </Text>
            </View>
            {showSwitcher && onChangeLens ? (
              <LensSwitcher value={activeLens} onChange={onChangeLens} />
            ) : null}
            {activeLens === 'hole' && currentHole ? (
              <View style={styles.hero}>
                <NumericText style={styles.heroNumber}>
                  {currentHole.number}
                </NumericText>
                <View style={styles.heroMeta}>
                  <Text style={styles.heroMetaText}>Par {currentHole.par}</Text>
                  {currentHole.yardage ? (
                    <Text style={styles.heroMetaText}>
                      {currentHole.yardage.toLocaleString()} yds
                    </Text>
                  ) : null}
                  {currentHole.handicapIndex ? (
                    <Text style={styles.heroMetaText}>
                      Hcp {currentHole.handicapIndex}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.toPar}>
                  <NumericText style={styles.toParValue}>
                    {formatScore(progress.relativeScore)}
                  </NumericText>
                  <Text style={styles.toParLabel}>
                    {round.scoringRule === 'scramble' ? 'TEAM' : 'RUNNING'}
                  </Text>
                </View>
              </View>
            ) : null}
          </GlassCard>

          {activeLens === 'hole' ? (
            <>
              <SwipeableHoleEditor
                round={round}
                currentHoleNumber={currentHoleNumber}
                onChangeCurrentHole={onChangeCurrentHole}
                onChangeScore={onChangeScore}
                onPressTeeForScorer={onPressTeeForScorer}
              />

              <View style={styles.footer}>
                {onPrimary ? (
                  <NeonButton
                    label={primaryLabel ?? 'Continue'}
                    onPress={onPrimary}
                  />
                ) : null}
                {onSecondary ? (
                  <Pressable
                    onPress={onSecondary}
                    accessibilityRole="button"
                    accessibilityLabel={secondaryLabel ?? 'Abandon round'}
                    style={({ pressed }) => [
                      styles.abandon,
                      pressed ? styles.abandonPressed : null,
                    ]}>
                    <Text style={styles.abandonText}>
                      {secondaryLabel ?? 'Abandon round'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : activeLens === 'card' ? (
            cardLens ?? null
          ) : (
            chatLens ?? null
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 14,
      paddingTop: 14,
    },
    card: {
      gap: 12,
    },
    headerCard: {
      gap: 14,
    },
    infoBar: {
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderRadius: 22,
      backgroundColor: colors.glassFill,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    infoCourse: {
      color: colors.textTitle,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.25,
    },
    infoMeta: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 4,
      paddingBottom: 2,
    },
    heroNumber: {
      color: colors.lime,
      fontSize: 60,
      fontWeight: '900',
      lineHeight: 62,
      textShadowColor: colors.cyan,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 18,
    },
    heroMeta: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    heroMetaText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 19,
    },
    toPar: {
      alignItems: 'flex-end',
      marginLeft: 'auto',
    },
    toParValue: {
      color: colors.lime,
      fontSize: 30,
      fontWeight: '900',
      lineHeight: 34,
    },
    toParLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 2,
    },
    footer: {
      paddingTop: 2,
      gap: 8,
    },
    abandon: {
      alignSelf: 'center',
      paddingVertical: 7,
      paddingHorizontal: 16,
    },
    abandonPressed: {
      opacity: 0.6,
    },
    abandonText: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}
