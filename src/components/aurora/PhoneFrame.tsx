/**
 * PhoneFrame — centres its children in a phone-width column on wide
 * web/desktop viewports (the global Aurora gradient fills the gutters);
 * a no-op on real phones, where the screen is already narrower than
 * `PHONE_MAX_WIDTH`.
 *
 * Apply this at the LEAF (inside a screen's body), never around a
 * navigator container — wrapping a Stack/Tabs in a centred max-width
 * View breaks react-native-screens' hiding of inactive scenes on web,
 * so inactive routes bleed through underneath the active one.
 *
 * Keep full-screen overlays (modals, sheets) OUTSIDE the frame so they
 * still cover the whole viewport.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PHONE_MAX_WIDTH } from './layout';

type Props = {
  children: ReactNode;
  /** Extra styles for the inner (capped-width) column. */
  style?: StyleProp<ViewStyle>;
};

export function PhoneFrame({ children, style }: Props) {
  return (
    <View style={styles.outer}>
      <View style={[styles.inner, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: PHONE_MAX_WIDTH,
  },
});
