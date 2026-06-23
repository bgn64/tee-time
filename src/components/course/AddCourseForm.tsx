/**
 * AddCourseForm — create a private custom course by entering its
 * scorecard by hand (feedback "custom-courses", F1).
 *
 * Mirrors the approved mockup's ADD COURSE screen: name + location, an
 * 18/9 holes toggle, a single editable tee set (name + colour + optional
 * rating/slope), and an editable Hole / Par / Yds / Hcp scorecard. On
 * save it writes a `source='custom'` row via `createCustomCourse` and
 * calls `onCreated` with the resulting `Course` (the host route decides
 * where to go next — select it for a round, or open its detail).
 *
 * Single tee for this milestone; the mockup's "Scan scorecard" CTA and
 * "Add another tee" are deferred follow-ups (see the feedback log).
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  GlassCard,
  NeonButton,
  NumericText,
  PHONE_MAX_WIDTH,
  SectionLabel,
  SegmentedToggle,
} from '@/components/aurora';
import { createCustomCourse } from '@/library/golf/customCourses';
import type { ColorToken } from '@/library/golf/teeColor';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Course } from '@/types/golf';

type Cell = { par: string; yds: string; hcp: string };

type Props = {
  /** Called with the created course once the row is written. */
  onCreated: (course: Course) => void;
  /** Primary button label (e.g. "Save course" or "Save & pick"). */
  submitLabel?: string;
};

const TEE_SWATCHES: readonly { token: ColorToken; label: string }[] = [
  { token: 'teeWhite', label: 'White' },
  { token: 'teeBlue', label: 'Blue' },
  { token: 'teeRed', label: 'Red' },
  { token: 'teeGold', label: 'Gold' },
  { token: 'teeBlack', label: 'Black' },
  { token: 'teeGreen', label: 'Green' },
];
const SWATCH_LABELS = new Set(TEE_SWATCHES.map((s) => s.label));

function emptyCells(): Cell[] {
  return Array.from({ length: 18 }, () => ({ par: '', yds: '', hcp: '' }));
}

function digits(v: string): string {
  return v.replace(/[^0-9]/g, '');
}

function ratingChars(v: string): string {
  // digits + a single decimal point
  const cleaned = v.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

function intOrUndef(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function floatOrUndef(v: string): number | undefined {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export function AddCourseForm({ onCreated, submitLabel = 'Save course' }: Props) {
  const { colors } = useTheme();
  const account = useRequiredAccount();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [teeName, setTeeName] = useState('White');
  const [teeToken, setTeeToken] = useState<ColorToken>('teeWhite');
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState('');
  const [cells, setCells] = useState<Cell[]>(emptyCells);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleCells = cells.slice(0, holeCount);
  const totalPar = visibleCells.reduce((sum, c) => sum + (intOrUndef(c.par) ?? 0), 0);
  const totalYds = visibleCells.reduce((sum, c) => sum + (intOrUndef(c.yds) ?? 0), 0);

  const setCell = (index: number, key: keyof Cell, value: string) => {
    setCells((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [key]: digits(value) } : c))
    );
  };

  const onSwatch = (token: ColorToken, label: string) => {
    setTeeToken(token);
    // Keep the name in sync for the common "didn't type a custom name" case.
    if (teeName.trim().length === 0 || SWATCH_LABELS.has(teeName.trim())) {
      setTeeName(label);
    }
  };

  const onSubmit = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError('Enter a course name.');
      return;
    }
    if (teeName.trim().length === 0) {
      setError('Enter a tee name.');
      return;
    }
    const holes = [];
    for (let i = 0; i < holeCount; i++) {
      const par = intOrUndef(visibleCells[i].par);
      if (par == null || par < 1 || par > 7) {
        setError(`Enter par (1–7) for hole ${i + 1}.`);
        return;
      }
      const yds = intOrUndef(visibleCells[i].yds);
      const hcp = intOrUndef(visibleCells[i].hcp);
      holes.push({
        number: i + 1,
        par,
        yardage: yds != null && yds > 0 ? yds : undefined,
        handicapIndex: hcp != null && hcp >= 1 && hcp <= holeCount ? hcp : undefined,
      });
    }

    setSaving(true);
    setError(null);
    try {
      const course = await createCustomCourse(
        {
          name: trimmedName,
          location: location.trim() || undefined,
          tee: {
            name: teeName.trim(),
            colorToken: teeToken,
            rating: floatOrUndef(rating),
            slope: intOrUndef(slope),
          },
          holes,
        },
        account.userId
      );
      onCreated(course);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the course.');
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <SectionLabel style={styles.firstLabel}>Course</SectionLabel>
        <LabeledInput
          styles={styles}
          colors={colors}
          icon="⛳"
          label="Course name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Sunset Ridge G.C."
          autoFocus
        />
        <LabeledInput
          styles={styles}
          colors={colors}
          icon="📍"
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="City, State"
        />

        <SectionLabel>Holes</SectionLabel>
        <SegmentedToggle
          options={[
            { key: '18', label: '18 holes', sublabel: 'full course' },
            { key: '9', label: '9 holes', sublabel: 'front / back' },
          ]}
          value={String(holeCount)}
          onChange={(k) => setHoleCount(k === '9' ? 9 : 18)}
          style={styles.toggle}
        />

        <SectionLabel>Tee</SectionLabel>
        <GlassCard style={styles.card}>
          <View style={styles.teeRow}>
            <View style={[styles.teeDot, { backgroundColor: colors[teeToken] }]} />
            <TextInput
              style={styles.teeNameInput}
              value={teeName}
              onChangeText={setTeeName}
              placeholder="Tee name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <View style={styles.ratingGroup}>
              <Text style={styles.ratingLabel}>Rating</Text>
              <TextInput
                style={styles.ratingInput}
                value={rating}
                onChangeText={(v) => setRating(ratingChars(v))}
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                maxLength={4}
              />
              <Text style={styles.ratingLabel}>Slope</Text>
              <TextInput
                style={styles.ratingInput}
                value={slope}
                onChangeText={(v) => setSlope(digits(v))}
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>
          <View style={styles.swatchRow}>
            {TEE_SWATCHES.map((s) => {
              const selected = s.token === teeToken;
              return (
                <Pressable
                  key={s.token}
                  onPress={() => onSwatch(s.token, s.label)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.label} tee colour`}
                  accessibilityState={{ selected }}
                  style={[
                    styles.swatch,
                    { backgroundColor: colors[s.token] },
                    selected ? styles.swatchSelected : null,
                  ]}
                />
              );
            })}
          </View>
        </GlassCard>

        <SectionLabel right={<Text style={styles.labelRight}>{teeName.trim() || 'Tee'}</Text>}>
          Scorecard
        </SectionLabel>
        <GlassCard style={styles.card}>
          <HoleGridNine
            startIndex={0}
            count={9}
            cells={cells}
            onCellChange={setCell}
            styles={styles}
            colors={colors}
          />
          {holeCount === 18 ? (
            <>
              <View style={styles.nineDivider} />
              <HoleGridNine
                startIndex={9}
                count={9}
                cells={cells}
                onCellChange={setCell}
                styles={styles}
                colors={colors}
              />
            </>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsText}>
              Par <Text style={styles.totalsStrong}>{totalPar > 0 ? totalPar : '—'}</Text>
            </Text>
            <NumericText style={styles.totalsYards}>
              {totalYds > 0 ? `${totalYds.toLocaleString('en-US')} yds` : '—'}
            </NumericText>
          </View>
        </GlassCard>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <NeonButton
          label={saving ? 'Saving…' : submitLabel}
          onPress={saving ? undefined : onSubmit}
          disabled={saving}
          iconRight={saving ? <ActivityIndicator color={colors.onNeon} /> : null}
          style={styles.submit}
        />
        <Text style={styles.privateNote}>🔒 Private to you · only you can play it</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({
  styles,
  colors,
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  styles: FormStyles;
  colors: ThemeColors;
  icon: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldIcon}>{icon}</Text>
      <View style={styles.fieldBody}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

function HoleGridNine({
  startIndex,
  count,
  cells,
  onCellChange,
  styles,
  colors,
}: {
  startIndex: number;
  count: number;
  cells: Cell[];
  onCellChange: (index: number, key: keyof Cell, value: string) => void;
  styles: FormStyles;
  colors: ThemeColors;
}) {
  const indices = Array.from({ length: count }, (_, k) => startIndex + k);
  return (
    <View>
      <View style={styles.gridRow}>
        <Text style={styles.gridLabel}>Hole</Text>
        {indices.map((i) => (
          <View key={i} style={styles.headCell}>
            <Text style={styles.gridHead}>{i + 1}</Text>
          </View>
        ))}
      </View>
      <EditRow
        label="Par"
        field="par"
        indices={indices}
        cells={cells}
        onCellChange={onCellChange}
        maxLength={1}
        styles={styles}
        colors={colors}
      />
      <EditRow
        label="Yds"
        field="yds"
        indices={indices}
        cells={cells}
        onCellChange={onCellChange}
        maxLength={3}
        styles={styles}
        colors={colors}
      />
      <EditRow
        label="Hcp"
        field="hcp"
        indices={indices}
        cells={cells}
        onCellChange={onCellChange}
        maxLength={2}
        styles={styles}
        colors={colors}
      />
    </View>
  );
}

function EditRow({
  label,
  field,
  indices,
  cells,
  onCellChange,
  maxLength,
  styles,
  colors,
}: {
  label: string;
  field: keyof Cell;
  indices: number[];
  cells: Cell[];
  onCellChange: (index: number, key: keyof Cell, value: string) => void;
  maxLength: number;
  styles: FormStyles;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.gridRow}>
      <Text style={styles.gridLabel}>{label}</Text>
      {indices.map((i) => (
        <View key={i} style={styles.cellBox}>
          <TextInput
            style={styles.cellInput}
            value={cells[i][field]}
            onChangeText={(v) => onCellChange(i, field, v)}
            placeholder="–"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={maxLength}
            accessibilityLabel={`${label} hole ${i + 1}`}
          />
        </View>
      ))}
    </View>
  );
}

type FormStyles = ReturnType<typeof makeStyles>;

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      padding: 16,
      paddingBottom: 40,
    },
    firstLabel: { marginTop: 0 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 10,
    },
    fieldIcon: { fontSize: 16, color: colors.cyan },
    fieldBody: { flex: 1, minWidth: 0 },
    fieldLabel: {
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
      fontWeight: '700',
    },
    fieldInput: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textTitle,
      paddingVertical: 2,
    },
    toggle: { marginBottom: 4 },
    card: { marginBottom: 6 },
    teeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    teeDot: { width: 14, height: 14, borderRadius: 7 },
    teeNameInput: {
      flex: 1,
      minWidth: 0,
      fontSize: 15,
      fontWeight: '700',
      color: colors.textTitle,
      paddingVertical: 2,
    },
    ratingGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ratingLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.3,
    },
    ratingInput: {
      width: 46,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 8,
      paddingVertical: 6,
    },
    swatchRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.glassStroke,
    },
    swatch: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    swatchSelected: { borderColor: colors.lime },
    labelRight: {
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    gridRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
    gridLabel: {
      width: 30,
      fontSize: 9,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.textMuted,
      fontWeight: '700',
    },
    headCell: { flex: 1, alignItems: 'center', minWidth: 0 },
    gridHead: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
    cellBox: {
      flex: 1,
      minWidth: 0,
      height: 30,
      marginHorizontal: 1.5,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellInput: {
      width: '100%',
      height: '100%',
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: colors.textTitle,
      padding: 0,
    },
    nineDivider: {
      height: 1,
      backgroundColor: colors.glassStroke,
      marginVertical: 8,
    },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.glassStroke,
    },
    totalsText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    totalsStrong: { color: colors.textTitle, fontWeight: '800' },
    totalsYards: { fontSize: 13, fontWeight: '800', color: colors.lime },
    errorText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.accent,
      marginTop: 10,
    },
    submit: { marginTop: 16 },
    privateNote: {
      textAlign: 'center',
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 12,
    },
  });
}
