import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/library/data/queryClient';
import { supabase } from '@/library/supabase/client';
import {
  type StatDefinition,
  type StatTone,
} from './builtInStats';
import { newCustomStatId } from './ids';

const CUSTOM_STAT_DEFINITIONS_TABLE = 'custom_stat_definitions';
const CUSTOM_STAT_KEY_PREFIX = 'custom:';

type CustomStatCloudRow = {
  id: string;
  label: string | null;
  value_type: string | null;
  deleted_at: string | null;
};

function isStatTone(value: unknown): value is StatTone {
  return value === 'good' || value === 'bad' || value === 'neutral';
}

export function customStatKey(id: string): string {
  return `${CUSTOM_STAT_KEY_PREFIX}${id}`;
}

export function isCustomStatKey(key: string): boolean {
  return key.startsWith(CUSTOM_STAT_KEY_PREFIX);
}

function definitionFromRow(row: CustomStatCloudRow): StatDefinition | null {
  const label = row.label?.trim();
  if (!row.id || !label) return null;
  const key = customStatKey(row.id);
  if (row.value_type === 'binary') {
    return {
      key,
      label,
      type: 'binary',
      yesTone: 'good',
      defaultEnabled: false,
    };
  }
  if (row.value_type === 'integer') {
    return {
      key,
      label,
      type: 'integer',
      defaultValue: 0,
      min: 0,
      aggregateTone: 'neutral',
      defaultEnabled: false,
    };
  }
  console.warn('[customStats] Ignoring unsupported custom stat type.', row);
  return null;
}

export function parseCustomStatDefinitions(raw: unknown): StatDefinition[] {
  if (!Array.isArray(raw)) return [];
  const definitions: StatDefinition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      console.warn('[customStats] Ignoring malformed stat snapshot.', item);
      continue;
    }
    const candidate = item as Record<string, unknown>;
    const key = typeof candidate.key === 'string' ? candidate.key : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (!isCustomStatKey(key) || !label) {
      console.warn('[customStats] Ignoring malformed stat snapshot.', item);
      continue;
    }
    if (candidate.type === 'binary') {
      definitions.push({
        key,
        label,
        type: 'binary',
        yesTone: isStatTone(candidate.yesTone) ? candidate.yesTone : 'good',
        defaultEnabled: false,
      });
      continue;
    }
    if (candidate.type === 'integer') {
      definitions.push({
        key,
        label,
        type: 'integer',
        defaultValue:
          typeof candidate.defaultValue === 'number' &&
          Number.isFinite(candidate.defaultValue)
            ? candidate.defaultValue
            : 0,
        min:
          typeof candidate.min === 'number' && Number.isFinite(candidate.min)
            ? candidate.min
            : 0,
        aggregateTone: isStatTone(candidate.aggregateTone)
          ? candidate.aggregateTone
          : 'neutral',
        defaultEnabled: false,
      });
      continue;
    }
    console.warn('[customStats] Ignoring unsupported stat snapshot.', item);
  }
  return definitions;
}

export function customStatsListKey(userId: string | null) {
  return ['custom_stat_definitions', userId] as const;
}

export function useCustomStats(userId: string | null): {
  definitions: StatDefinition[];
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<StatDefinition[], Error>({
    queryKey: customStatsListKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(CUSTOM_STAT_DEFINITIONS_TABLE)
        .select('id, label, value_type, deleted_at')
        .eq('owner_user_id', userId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as CustomStatCloudRow[])
        .map(definitionFromRow)
        .filter((definition): definition is StatDefinition => definition !== null);
    },
  });
  return { definitions: data ?? [], isLoading, error: error ?? null };
}

export async function createCustomBinaryStat(
  ownerUserId: string,
  rawLabel: string
): Promise<StatDefinition> {
  const label = rawLabel.trim();
  if (!label) throw new Error('Stat name is required.');
  if (label.length > 40) throw new Error('Stat names must be 40 characters or fewer.');

  const id = newCustomStatId();
  const now = new Date().toISOString();
  const { error } = await supabase.from(CUSTOM_STAT_DEFINITIONS_TABLE).insert({
    id,
    owner_user_id: ownerUserId,
    label,
    value_type: 'binary',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error('A custom stat with this name already exists.');
    }
    throw error;
  }
  const definition: StatDefinition = {
    key: customStatKey(id),
    label,
    type: 'binary',
    yesTone: 'good',
    defaultEnabled: false,
  };
  queryClient.setQueryData<StatDefinition[]>(
    customStatsListKey(ownerUserId),
    (current) => [...(current ?? []), definition]
  );
  await queryClient.invalidateQueries({
    queryKey: ['custom_stat_definitions'],
  });
  return definition;
}
