/**
 * SwipeableHoleEditor — the per-hole editing surface for the scoring /
 * edit screens. Each focused hole renders a `HoleEditPane` (score
 * stepper + stat inputs per scorer); explicit Prev / Next buttons move
 * between holes.
 *
 * Data hooks are called ONCE here and the resolved values handed down to
 * the active `HoleEditPane`. Prev / Next calls `onChangeCurrentHole` so
 * the round's stored current hole stays in sync.
 */

import { useCallback, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { HoleEditPane } from './HoleEditPane';
import { holesInRange } from '@/library/golf/scoring';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useRoundShotAttributions } from '@/library/golf/useRoundShotAttributions';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  currentHoleNumber: number;
  onChangeCurrentHole: (n: number) => void;
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
  onPressTeeForScorer?: (scorerId: string) => void;
};

export function SwipeableHoleEditor({
  round,
  currentHoleNumber,
  onChangeCurrentHole,
  onChangeScore,
  onPressTeeForScorer,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { getValues, setValue, seedDefaults } = useRoundHoleDetails(round.id);
  const { getContributors, setContributors } = useRoundShotAttributions(
    round.id
  );

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  const trackedSet = useMemo(
    () => new Set(round.trackedScorerIds),
    [round.trackedScorerIds]
  );

  const holes = useMemo(
    () => holesInRange(round.course.holes, round.holeRange),
    [round.course.holes, round.holeRange]
  );

  const index = useMemo(() => {
    const i = holes.findIndex((h) => h.number === currentHoleNumber);
    return i >= 0 ? i : 0;
  }, [holes, currentHoleNumber]);

  const count = holes.length;
  const currentHole = holes[index];

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(count - 1, i));
      const n = holes[clamped]?.number;
      if (n != null && n !== currentHoleNumber) {
        onChangeCurrentHole(n);
      }
    },
    [count, holes, currentHoleNumber, onChangeCurrentHole]
  );

  return (
    <View style={styles.wrap}>
      {currentHole ? (
        <HoleEditPane
          round={round}
          hole={currentHole}
          scorers={scorers}
          trackedSet={trackedSet}
          isScramble={isScramble}
          getValues={getValues}
          getContributors={getContributors}
          onChangeScore={onChangeScore}
          onChangeStat={(scorerId, holeNumber, statKey, value) =>
            void setValue(scorerId, holeNumber, statKey, value)
          }
          onChangeContributors={(scorerId, holeNumber, next) =>
            void setContributors(scorerId, holeNumber, next)
          }
          seedDefaults={(scorerId, holeNumber, integerStats) =>
            void seedDefaults(scorerId, holeNumber, integerStats)
          }
          onPressTeeForScorer={onPressTeeForScorer}
        />
      ) : null}

      <View style={styles.nav}>
        <Pressable
          onPress={() => goTo(index - 1)}
          disabled={index <= 0}
          accessibilityRole="button"
          accessibilityLabel="Previous hole"
          accessibilityState={{ disabled: index <= 0 }}
          style={({ pressed }) => [
            styles.navButton,
            index <= 0 ? styles.navDisabled : null,
            pressed ? styles.navPressed : null,
          ]}>
          <Text style={styles.navText}>‹ Prev</Text>
        </Pressable>
        <Pressable
          onPress={() => goTo(index + 1)}
          disabled={index >= count - 1}
          accessibilityRole="button"
          accessibilityLabel="Next hole"
          accessibilityState={{ disabled: index >= count - 1 }}
          style={({ pressed }) => [
            styles.navButton,
            styles.navPrimary,
            index >= count - 1 ? styles.navDisabled : null,
            pressed ? styles.navPrimaryPressed : null,
          ]}>
          <Text style={[styles.navText, styles.navPrimaryText]}>Next ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
    },
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 12,
      paddingHorizontal: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
    },
    navButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glassFill,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    navPrimary: {
      backgroundColor: colors.lime,
      borderColor: colors.lime,
    },
    navDisabled: {
      opacity: 0.4,
    },
    navPressed: {
      backgroundColor: colors.glassFill2,
    },
    navPrimaryPressed: {
      opacity: 0.75,
    },
    navText: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '900',
    },
    navPrimaryText: {
      color: colors.night,
    },
  });
}
