/**
 * RoundDetailView — full detail render for a single round, shared
 * by every detail-view state in the app:
 *
 *   ① Completed + viewing  (feed / Previous-rounds read-only)
 *   ② In-progress + editing (scoring tab — wires `isEditing=true`
 *      + handlers + topActions + footerActions)
 *   ③ Completed + editing  (Previous-rounds Edit route)
 *   ④ In-progress + viewing (feed live round)
 *
 * The component is the same in all four; what differs is the
 * `isEditing` flag, whether `currentHoleNumber` + score-change
 * handlers are supplied, and what (if anything) the caller renders
 * in the `topActions` / `footerActions` slots.
 *
 * Composes:
 *   1. `topActions` slot (e.g. "Finish" / "Done" / "Edit" buttons).
 *   2. `<RoundCardHeader showScoreBlock={false} />` — the gradient
 *      identity band, score block intentionally hidden because the
 *      per-scorer rows below carry the same info per scorer.
 *   3. `<HoleNavBar />` — editing modes only.
 *   4. `<ScorerStack />` — per-scorer rows. `isEditing` toggles the
 *      score buttons + tee-pill interactivity.
 *   5. `<ReadOnlyScorecard />` — vertical grid with inline totals.
 *   6. `<CommentsSection />` — thread + composer.
 *   7. `footerActions` slot (e.g. "Delete" / "Abandon").
 */

import { useRouter } from 'expo-router';
import { ReactNode, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CommentsSection } from './CommentsSection';
import { RoundCardHeader } from './RoundCardHeader';
import { ScorerStack } from './ScorerStack';
import { HoleNavBar } from '@/components/scoring/HoleNavBar';
import { ReadOnlyScorecard } from '@/components/scoring/ReadOnlyScorecard';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  /**
   * Caller decides which tab's profile route to push to when a
   * scorer's avatar is tapped in the scorecard grid. Lets the
   * shared component sit inside any tab stack.
   */
  profileRoutePrefix: string;

  /** True when score-entry affordances should be visible. */
  isEditing?: boolean;
  /**
   * Hole the editing UI is focused on. Drives both the HoleNavBar
   * and the score-chips' active value. Also drives the scorecard's
   * current-hole row tint in editing mode.
   */
  currentHoleNumber?: number;
  /** Required when `isEditing` for the HoleNavBar arrows. */
  onChangeCurrentHole?: (n: number) => void;

  /** Optional slot above the band (e.g. Finish / Done / Edit buttons). */
  topActions?: ReactNode;
  /** Optional slot below comments (e.g. Delete / Abandon buttons). */
  footerActions?: ReactNode;

  /** Editing-only score-change handler. Wired into ScorerStack. */
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
  /** Editing-only tee-pill tap handler. Wired into ScorerStack. */
  onPressTeeForScorer?: (scorerId: string) => void;
};

export function RoundDetailView({
  round,
  profileRoutePrefix,
  isEditing = false,
  currentHoleNumber,
  onChangeCurrentHole,
  topActions,
  footerActions,
  onChangeScore,
  onPressTeeForScorer,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  // Build the per-tee yardages payload for HoleNavBar. Empty when
  // not editing (HoleNavBar is hidden anyway). Same derivation that
  // scoring.tsx had inline.
  const navTees = useMemo(() => {
    if (!isEditing || currentHoleNumber == null) return [];
    const currentHole = round.course.holes.find(
      (h) => h.number === currentHoleNumber
    );
    if (!currentHole) return [];
    const courseTees = round.course.tees ?? [];
    return courseTees
      .map((tee) => ({
        id: tee.id,
        name: tee.name,
        color: tee.color,
        yardage: currentHole.yardages?.[tee.id],
      }))
      .filter((t) => Number.isFinite(t.yardage))
      .sort((a, b) => {
        const at = courseTees.find((ct) => ct.id === a.id)?.totalYardage ?? -1;
        const bt = courseTees.find((ct) => ct.id === b.id)?.totalYardage ?? -1;
        return bt - at;
      });
  }, [isEditing, currentHoleNumber, round.course]);

  const maxHole = round.course.holes.length;

  return (
    <View style={styles.shell}>
      {topActions ? <View style={styles.actionsSlot}>{topActions}</View> : null}

      <View style={styles.bandWrap}>
        <RoundCardHeader round={round} showScoreBlock={false} />
      </View>

      {isEditing && currentHoleNumber != null && onChangeCurrentHole ? (
        <HoleNavBar
          holeNumber={currentHoleNumber}
          par={
            round.course.holes.find((h) => h.number === currentHoleNumber)
              ?.par ?? 0
          }
          tees={navTees}
          maxHole={maxHole}
          onChange={onChangeCurrentHole}
        />
      ) : null}

      <ScorerStack
        round={round}
        isEditing={isEditing}
        currentHoleNumber={currentHoleNumber}
        onChangeScore={onChangeScore}
        onPressTeeForScorer={onPressTeeForScorer}
      />

      <View>
        <ReadOnlyScorecard
          round={round}
          currentHoleNumber={currentHoleNumber}
          onHolePress={onChangeCurrentHole}
          onPressParticipant={(userId) =>
            router.push(`${profileRoutePrefix}/${userId}` as never)
          }
        />
      </View>

      <CommentsSection
        roundId={round.id}
        ownerUserId={round.ownerUserId ?? ''}
      />

      {footerActions ? (
        <View style={styles.actionsSlot}>{footerActions}</View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    shell: {
      gap: 14,
    },
    bandWrap: {
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionsSlot: {
      // Lets the route wrapper inject any padding it wants on the
      // children it passes.
    },
  });
}
