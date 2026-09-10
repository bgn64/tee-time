import {
  aggregateBinary,
  aggregateInteger,
} from './aggregateHoleDetails';
import { enabledStatDefinitions } from './builtInStats';
import { isCustomStatKey } from './customStats';
import { holesInRange } from './scoring';
import { displayStatName } from './statDisplay';
import type { HoleDetailsRow } from './useRoundHoleDetails';
import type { Round } from '@/types/golf';

export type RoundStatSummary = {
  key: string;
  label: string;
  value: string;
  tone: 'default' | 'lime' | 'cyan' | 'danger';
  custom: boolean;
};

export function buildRoundStatSummaries(
  round: Round,
  scorerId: string | undefined,
  rows: readonly HoleDetailsRow[]
): RoundStatSummary[] {
  if (!scorerId || !round.trackedScorerIds.includes(scorerId)) return [];

  const holes = holesInRange(round.course.holes, round.holeRange);
  return enabledStatDefinitions(
    round.enabledStatKeys,
    round.customStatDefinitions
  ).map((stat) => {
    const custom = isCustomStatKey(stat.key);
    if (stat.type === 'binary') {
      const aggregate = aggregateBinary(rows, scorerId, stat, holes);
      return {
        key: stat.key,
        label: displayStatName(stat.key, stat.label),
        value:
          aggregate.denom > 0 ? `${aggregate.num}/${aggregate.denom}` : '—',
        tone:
          aggregate.denom === 0
            ? 'default'
            : custom
              ? 'cyan'
              : stat.key === 'gir'
                ? 'cyan'
                : stat.yesTone === 'bad' && aggregate.num > 0
                  ? 'danger'
                  : 'lime',
        custom,
      };
    }

    const aggregate = aggregateInteger(rows, scorerId, stat, holes);
    return {
      key: stat.key,
      label: displayStatName(stat.key, stat.label),
      value: aggregate.taggedCount > 0 ? String(aggregate.sum) : '—',
      tone:
        aggregate.taggedCount === 0 || aggregate.sum === 0
          ? 'default'
          : custom
            ? 'cyan'
            : stat.aggregateTone === 'bad'
              ? 'danger'
              : stat.aggregateTone === 'good'
                ? 'lime'
                : 'default',
      custom,
    };
  });
}