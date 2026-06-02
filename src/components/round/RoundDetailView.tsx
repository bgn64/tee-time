/**
 * RoundDetailView — full detail render for a single round, shared by
 * every detail-view state in the app:
 *
 *   ① Completed + viewing  (feed / Previous-rounds read-only)
 *   ② In-progress + editing (scoring tab — wires `isEditing=true`
 *      + handlers + topActions + footerActions)
 *   ③ Completed + editing  (Previous-rounds Edit route)
 *   ④ In-progress + viewing (feed live round)
 *
 * Phase 1 redesign — like `RoundListCard`, this is now an
 * edge-to-edge tabbed surface (Summary · Scorecard · Holes) hosted
 * inside the same `TabbedRoundShell` so both surfaces share the
 * same chrome.
 *
 * The Holes tab body during editing intentionally keeps the legacy
 * `<HoleNavBar>` + `<ScorerStack>` arrangement so score entry stays
 * functional through Phase 1. Phase 3 replaces that with
 * `HoleStepperCombo` + per-scorer entry blocks; Phases 4–6 fill in
 * achievement tags and scramble shot attribution. The viewing
 * variant (no editing) renders a "Coming soon" placeholder until
 * Phase 3 lands the read-only viewer.
 *
 * Action bar (Like + Comments) sits at the bottom of the card; the
 * Comments tap opens a bottom-sheet modal. `topActions` and
 * `footerActions` slots are preserved so the scoring route can keep
 * mounting Finish + Abandon outside the card.
 */

import { useRouter } from 'expo-router';
import { ReactNode, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CommentsSheet } from './CommentsSheet';
import { EditorialHeader } from './EditorialHeader';
import { HolesTabPlaceholder } from './HolesTabPlaceholder';
import { RoundActionBar } from './RoundActionBar';
import { ScorerStack } from './ScorerStack';
import { SummaryTabContent } from './SummaryTabContent';
import { TabbedRoundShell } from './TabbedRoundShell';
import { HoleNavBar } from '@/components/scoring/HoleNavBar';
import { ReadOnlyScorecard } from '@/components/scoring/ReadOnlyScorecard';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { userParticipantKey } from '@/library/golf/participantKey';
import {
  formatRelativeTime,
  getScorerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
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

  /** Optional slot above the card (e.g. Finish / Done / Edit buttons). */
  topActions?: ReactNode;
  /** Optional slot below the card (e.g. Delete / Abandon buttons). */
  footerActions?: ReactNode;

  /** Editing-only score-change handler. Wired into ScorerStack. */
  onChangeScore?: (
    scorerId: string,
    holeNumber: number,
    strokes: number
  ) => void;
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

  const { count: commentCount } = useCommentSummary(round.id);
  const [sheetVisible, setSheetVisible] = useState(false);

  const { topLineLeft, topLineRight } = useMemo(
    () => deriveTopLine(round),
    [round]
  );
  const subtitle = useMemo(() => deriveSubtitle(round), [round]);
  const isInProgress = !round.completedAt;

  // Holes tab body — preserves legacy editing flow through Phase 1.
  // Phase 3 replaces this entirely with HolesTabContent.
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
        const at =
          courseTees.find((ct) => ct.id === a.id)?.totalYardage ?? -1;
        const bt =
          courseTees.find((ct) => ct.id === b.id)?.totalYardage ?? -1;
        return bt - at;
      });
  }, [isEditing, currentHoleNumber, round.course]);

  const maxHole = round.course.holes.length;

  const holesBody =
    isEditing && currentHoleNumber != null && onChangeCurrentHole ? (
      <View style={styles.holesEditing}>
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
        <ScorerStack
          round={round}
          isEditing={isEditing}
          currentHoleNumber={currentHoleNumber}
          onChangeScore={onChangeScore}
          onPressTeeForScorer={onPressTeeForScorer}
        />
      </View>
    ) : (
      <HolesTabPlaceholder />
    );

  return (
    <View style={styles.shell}>
      {topActions ? <View style={styles.actionsSlot}>{topActions}</View> : null}

      <View style={styles.card}>
        <EditorialHeader
          liveStripVisible={isInProgress}
          topLineLeft={topLineLeft}
          topLineRight={topLineRight}
          title={round.course.name}
          subtitle={subtitle}
        />
        <TabbedRoundShell
          summary={<SummaryTabContent round={round} />}
          scorecard={
            <View style={styles.tabBody}>
              <ReadOnlyScorecard
                round={round}
                currentHoleNumber={currentHoleNumber}
                onHolePress={onChangeCurrentHole}
                onPressParticipant={(userId) =>
                  router.push(`${profileRoutePrefix}/${userId}` as never)
                }
              />
            </View>
          }
          holes={holesBody}
        />
        <RoundActionBar
          commentCount={commentCount}
          onOpenComments={() => setSheetVisible(true)}
        />
      </View>

      <CommentsSheet
        visible={sheetVisible}
        roundId={round.id}
        ownerUserId={round.ownerUserId ?? ''}
        commentCount={commentCount}
        onClose={() => setSheetVisible(false)}
      />

      {footerActions ? (
        <View style={styles.actionsSlot}>{footerActions}</View>
      ) : null}
    </View>
  );
}

function deriveTopLine(round: Round): {
  topLineLeft: string;
  topLineRight?: string;
} {
  const isInProgress = !round.completedAt;
  const ownerUserId = round.ownerUserId ?? '';
  const ownerScorerId =
    scorerIdForUser(round, ownerUserId) ?? userParticipantKey(ownerUserId);

  if (isInProgress) {
    const { thruCount } = getScorerProgress(round, ownerScorerId);
    const left =
      thruCount > 0 ? `LIVE · THRU ${thruCount}` : 'LIVE · NOT STARTED';
    const right = formatRelativeTime(round.lastScoreAt ?? round.startedAt);
    return { topLineLeft: left, topLineRight: right };
  }
  const left = `Completed · ${formatRelativeTime(round.completedAt ?? round.startedAt)}`;
  return { topLineLeft: left };
}

function deriveSubtitle(round: Round): string {
  const location = round.course.location?.trim();
  const format = round.scoringRule === 'scramble' ? 'Scramble' : 'Stroke';
  const holes = `${round.course.holes.length} holes`;
  const parts = [location, format, holes].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
  return parts.join(' · ');
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    shell: {
      gap: 14,
    },
    card: {
      backgroundColor: colors.cardBg,
      ...colors.shadowCard,
    },
    tabBody: {
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    holesEditing: {
      // Holes tab in editing mode: HoleNavBar + ScorerStack with
      // score-chip rows. Preserves the existing entry experience
      // until Phase 3 replaces it.
      paddingHorizontal: 4,
      paddingBottom: 8,
      gap: 10,
    },
    actionsSlot: {
      // Lets the route wrapper inject any padding it wants on the
      // children it passes.
    },
  });
}

