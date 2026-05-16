/**
 * Unified course create / edit form. The same screen handles both modes;
 * presence of a `courseId` route param flips it into edit mode.
 *
 *   Create mode:  push without params (or with `prefillName` from search)
 *   Edit mode:    push with { courseId } (only valid for source: 'custom')
 *
 * Scope simplifications (per docs/phase-1-mockups.html):
 *   · Always 18 holes — no hole-count input.
 *   · Pars: tap-to-cycle 3 → 4 → 5 (default 4 / par 72). Color-coded.
 *   · Long-press a par cell → bottom sheet with par picker + yardage input.
 *     Yardage is the only way to enter optional `Hole.yardage`.
 *   · Location is optional; empty string is valid.
 *   · Yardage stays an optional `Hole.yardage?` field on the schema.
 *
 * Header chrome: left = "‹ Course" back button. The form uses no right slot.
 */

import { router, useLocalSearchParams, Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { HoleDetailSheet } from '@/components/HoleDetailSheet';
import { newCourseId } from '@/lib/ids';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';
import { Hole } from '@/types/golf';

const HOLE_COUNT = 18;
const DEFAULT_PAR = 3;
const PAR_CYCLE = [3, 4, 5] as const;

function nextPar(current: number): number {
  const idx = PAR_CYCLE.indexOf(current as 3 | 4 | 5);
  if (idx === -1) return DEFAULT_PAR;
  return PAR_CYCLE[(idx + 1) % PAR_CYCLE.length];
}

function buildHoles(pars: number[], yardages: (number | null)[]): Hole[] {
  return Array.from({ length: HOLE_COUNT }, (_, i) => {
    const yardage = yardages[i];
    return {
      number: i + 1,
      par: Math.max(1, pars[i] ?? DEFAULT_PAR),
      ...(yardage !== null && yardage > 0 ? { yardage } : {}),
    };
  });
}

/**
 * Gate component: custom-course creation lives in the Score-tab setup
 * flow. If a round is already in progress, redirect to `/scoring` —
 * the user can manage courses from elsewhere or after the round.
 * See `app/(tabs)/(score)/_layout.tsx` for the broader invariant.
 */
export default function CourseFormScreenGate() {
  const { currentRound } = useGolfRound();
  if (currentRound) {
    return <Redirect href="/(tabs)/(score)/scoring" />;
  }
  return <CourseFormScreen />;
}

function CourseFormScreen() {
  const { prefillName, prefillLocation, prefillHoles, courseId } = useLocalSearchParams<{
    prefillName?: string;
    prefillLocation?: string;
    prefillHoles?: string;
    courseId?: string;
  }>();
  const { colors } = useTheme();
  const { courses, addCourse, updateCourse, removeCourse, setPendingSelectedCourseId } =
    useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Lazy-init from the editing course if present.
  const editingCourse = useMemo(() => {
    if (!courseId) return null;
    return courses.find((c) => c.id === courseId) ?? null;
  }, [courseId, courses]);

  const isEditMode = Boolean(editingCourse);

  // Decode the optional prefilled holes blob. Best-effort: if it's
  // malformed we just fall back to defaults.
  const prefilledHoles = useMemo<Hole[] | null>(() => {
    if (!prefillHoles) return null;
    try {
      const parsed = JSON.parse(prefillHoles);
      if (!Array.isArray(parsed)) return null;
      const cleaned = parsed
        .map((h: any) => {
          const number = Number(h.number);
          const par = Number(h.par);
          if (!Number.isFinite(number) || !Number.isFinite(par)) return null;
          return { number, par } as Hole;
        })
        .filter((h): h is Hole => h !== null);
      return cleaned.length > 0 ? cleaned : null;
    } catch {
      return null;
    }
  }, [prefillHoles]);

  const [name, setName] = useState<string>(() => editingCourse?.name ?? prefillName ?? '');
  const [location, setLocation] = useState<string>(
    () => editingCourse?.location ?? prefillLocation ?? ''
  );
  const [pars, setPars] = useState<number[]>(() =>
    Array.from({ length: HOLE_COUNT }, (_, i) => {
      if (editingCourse) return editingCourse.holes[i]?.par ?? DEFAULT_PAR;
      const prefilled = prefilledHoles?.find((h) => h.number === i + 1);
      return prefilled?.par ?? DEFAULT_PAR;
    })
  );
  const [yardages, setYardages] = useState<(number | null)[]>(() =>
    Array.from({ length: HOLE_COUNT }, (_, i) =>
      editingCourse?.holes[i]?.yardage ?? null
    )
  );
  const [editingHole, setEditingHole] = useState<number | null>(null);

  useScreenHeader({
    left: { kind: 'back', label: 'Course', onPress: () => router.back() },
    right: { kind: 'none' },
  });

  function handleParTap(index: number) {
    setPars((prev) => prev.map((p, i) => (i === index ? nextPar(p) : p)));
  }

  function handleParLongPress(index: number) {
    setEditingHole(index);
  }

  function handleSheetSave(par: number, yardage: number | null) {
    if (editingHole === null) return;
    setPars((prev) => prev.map((p, i) => (i === editingHole ? par : p)));
    setYardages((prev) => prev.map((y, i) => (i === editingHole ? yardage : y)));
    setEditingHole(null);
  }

  function handleSheetCancel() {
    setEditingHole(null);
  }

  function handleSave() {
    if (!name.trim()) return;
    const holes = buildHoles(pars, yardages);

    if (editingCourse) {
      updateCourse(editingCourse.id, {
        name: name.trim(),
        location: location.trim(),
        holes,
      });
      setPendingSelectedCourseId(editingCourse.id);
    } else {
      const newId = newCourseId();
      addCourse({
        id: newId,
        name: name.trim(),
        location: location.trim(),
        source: 'custom',
        holes,
      });
      setPendingSelectedCourseId(newId);
    }
    router.back();
  }

  function handleDelete() {
    if (!editingCourse) return;
    removeCourse(editingCourse.id);
    router.back();
  }

  const front9 = pars.slice(0, 9);
  const back9 = pars.slice(9, 18);
  const front9Total = front9.reduce((t, p) => t + p, 0);
  const back9Total = back9.reduce((t, p) => t + p, 0);
  const totalPar = front9Total + back9Total;

  const yardagesEntered = yardages.filter((y) => y !== null && y > 0).length;
  const totalYards = yardages.reduce<number>((t, y) => t + (y ?? 0), 0);

  const editingHoleNumber = editingHole !== null ? editingHole + 1 : null;
  const editingPar = editingHole !== null ? pars[editingHole] : DEFAULT_PAR;
  const editingYardage = editingHole !== null ? yardages[editingHole] : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isEditMode ? 'Edit Course' : 'New Course'}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Course Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pine Ridge Golf Club"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.optChip}>OPTIONAL</Text>
          </View>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Seattle, WA"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.parsSection}>
          <Text style={styles.label}>Pars per Hole</Text>

          <ParGrid
            styles={styles}
            colors={colors}
            pars={front9}
            yardages={yardages.slice(0, 9)}
            startIndex={0}
            label="FRONT 9"
            parTotal={front9Total}
            onTap={handleParTap}
            onLongPress={handleParLongPress}
          />

          <View style={{ height: 12 }} />

          <ParGrid
            styles={styles}
            colors={colors}
            pars={back9}
            yardages={yardages.slice(9, 18)}
            startIndex={9}
            label="BACK 9"
            parTotal={back9Total}
            onTap={handleParTap}
            onLongPress={handleParLongPress}
          />

          <Text style={styles.tipCaption}>
            Tap a hole to cycle pars · long-press for yardage
          </Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL PAR</Text>
          <Text style={styles.totalNumber}>{totalPar}</Text>
        </View>

        {yardagesEntered > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              YARDAGES · {yardagesEntered} of {HOLE_COUNT}
            </Text>
            <Text style={styles.totalNumber}>{totalYards.toLocaleString()} yds</Text>
          </View>
        )}

        <Pressable
          style={[styles.saveButton, !name.trim() && styles.disabledButton]}
          onPress={handleSave}
          disabled={!name.trim()}>
          <Text style={styles.saveButtonText}>
            {isEditMode ? 'Save Changes' : 'Create'}
          </Text>
        </Pressable>

        {isEditMode && (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete course</Text>
          </Pressable>
        )}
      </ScrollView>

      <HoleDetailSheet
        visible={editingHole !== null}
        holeNumber={editingHoleNumber}
        initialPar={editingPar}
        initialYardage={editingYardage}
        onCancel={handleSheetCancel}
        onSave={handleSheetSave}
      />
    </KeyboardAvoidingView>
  );
}

type ParGridProps = {
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>['colors'];
  pars: number[];
  yardages: (number | null)[];
  startIndex: number;
  label: string;
  parTotal: number;
  onTap: (index: number) => void;
  onLongPress: (index: number) => void;
};

function ParGrid({
  styles,
  colors,
  pars,
  yardages,
  startIndex,
  label,
  parTotal,
  onTap,
  onLongPress,
}: ParGridProps) {
  return (
    <View>
      <View style={styles.nineLabelRow}>
        <Text style={styles.nineLabelText}>{label}</Text>
        <Text style={styles.nineTotalText}>{parTotal}</Text>
      </View>
      <View style={styles.parRow}>
        {pars.map((par, i) => {
          const absoluteIndex = startIndex + i;
          const hasYardage = yardages[i] !== null && (yardages[i] ?? 0) > 0;
          const par3 = par === 3;
          const par5 = par === 5;
          return (
            <Pressable
              key={absoluteIndex}
              onPress={() => onTap(absoluteIndex)}
              onLongPress={() => onLongPress(absoluteIndex)}
              delayLongPress={300}
              style={({ pressed }) => [
                styles.parCell,
                par3 && { backgroundColor: colors.primary + '22' },
                par5 && { backgroundColor: colors.accent + '22' },
                pressed && { opacity: 0.6 },
              ]}>
              <Text style={styles.parCellHole}>{absoluteIndex + 1}</Text>
              <Text
                style={[
                  styles.parCellNumber,
                  par3 && { color: colors.primaryDark },
                  par5 && { color: colors.accent },
                ]}>
                {par}
              </Text>
              {hasYardage && <View style={[styles.yardageMark, { backgroundColor: colors.accent }]} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
    },
    field: {
      marginTop: 16,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    label: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    optChip: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.accent,
      backgroundColor: colors.accent + '22',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      letterSpacing: 0.5,
      marginBottom: 8,
      overflow: 'hidden',
    },
    input: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.textBody,
      fontSize: 16,
      padding: 14,
    },
    parsSection: {
      marginTop: 22,
    },
    nineLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 6,
      marginTop: 4,
    },
    nineLabelText: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.6,
    },
    nineTotalText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
    parRow: {
      flexDirection: 'row',
      gap: 4,
    },
    parCell: {
      flex: 1,
      backgroundColor: colors.chipBg,
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: 'center',
      position: 'relative',
    },
    parCellHole: {
      fontSize: 9,
      color: colors.textMuted,
      fontWeight: '700',
      lineHeight: 11,
    },
    parCellNumber: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
      lineHeight: 22,
      marginTop: 2,
    },
    yardageMark: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    tipCaption: {
      fontSize: 11,
      color: colors.textMuted,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 10,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginTop: 10,
    },
    totalLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    totalNumber: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
    },
    saveButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      marginTop: 24,
      paddingVertical: 16,
    },
    disabledButton: {
      opacity: 0.4,
    },
    saveButtonText: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '800',
    },
    deleteButton: {
      alignItems: 'center',
      borderRadius: 14,
      marginTop: 6,
      paddingVertical: 14,
    },
    deleteButtonText: {
      color: '#d32f2f',
      fontSize: 14,
      fontWeight: '700',
    },
  });
}
