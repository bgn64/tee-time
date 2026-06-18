/**
 * NumericText — text primitive that applies tabular numerics for aligned stats.
 */

import { useMemo, type JSX } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { numericFontVariant } from '@/library/theme/themes';

export function NumericText(props: TextProps): JSX.Element {
  const styles = useMemo(() => makeStyles(), []);
  const { style, children, ...rest } = props;

  return (
    <Text
      {...rest}
      style={[styles.numeric, style as StyleProp<TextStyle>]}>
      {children}
    </Text>
  );
}

function makeStyles() {
  return StyleSheet.create({
    numeric: {
      fontVariant: [...numericFontVariant],
    },
  });
}
