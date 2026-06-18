/**
 * ScoreChipRow — Aurora Stepper score entry for the focused hole.
 * Parent provides current par/strokes and the onChange callback; this
 * component only translates −/+ taps into raw stroke writes.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Stepper } from '@/components/aurora';

type Props = {
  par: number;
  strokes: number | null;
  onChange: (strokes: number) => void;
};

export function ScoreChipRow({
  par,
  strokes,
  onChange,
}: Props) {
  const styles = useMemo(() => makeStyles(), []);
  const value = strokes ?? Math.max(1, par);

  return (
    <View style={styles.row}>
      <Stepper
        value={value}
        min={1}
        displayValue={strokes == null ? '–' : String(strokes)}
        onDecrement={() => onChange(Math.max(1, value - 1))}
        onIncrement={() => onChange(strokes == null ? value : value + 1)}
      />
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginLeft: 'auto',
    },
  });
}
