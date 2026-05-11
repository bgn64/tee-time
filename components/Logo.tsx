/**
 * Tee Time logo mark, rendered as native SVG (react-native-svg).
 *
 * Same artwork as `assets/logo/logo-mark.svg`, transcribed in JSX so the
 * mark can render inline in any RN view (the app header, the splash, etc.)
 * without going through the rasterized PNG assets.
 *
 * Color defaults to the active theme's `primaryDark` so the mark adapts to
 * the user's theme. Override with the `color` prop where needed.
 */

import { useTheme } from '@/state/ThemeContext';
import { Circle, Line, Path, Svg } from 'react-native-svg';

export type LogoProps = {
  /** Edge length in pixels. Logo is square. */
  size?: number;
  /** Stroke + dimple color. Defaults to theme primaryDark. */
  color?: string;
  /** Fill of the ball. Defaults to theme background so it punches through. */
  ballFill?: string;
};

export function Logo({ size = 28, color, ballFill }: LogoProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.primaryDark;
  const fill = ballFill ?? colors.background;

  // Stroke widths are tuned so the mark reads cleanly at every size. We
  // boost stroke width slightly at small sizes because thin lines vanish.
  const strokeWidth = size <= 32 ? 4.5 : size <= 64 ? 3.6 : 3.2;
  const dimpleR = size <= 32 ? 1.8 : 1.3;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Ball */}
      <Circle cx={50} cy={28} r={16} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />

      {/* Dimples */}
      <Circle cx={44} cy={22} r={dimpleR} fill={stroke} />
      <Circle cx={50} cy={21} r={dimpleR} fill={stroke} />
      <Circle cx={56} cy={22} r={dimpleR} fill={stroke} />

      <Circle cx={41} cy={28} r={dimpleR} fill={stroke} />
      <Circle cx={47} cy={28} r={dimpleR} fill={stroke} />
      <Circle cx={53} cy={28} r={dimpleR} fill={stroke} />
      <Circle cx={59} cy={28} r={dimpleR} fill={stroke} />

      <Circle cx={44} cy={34} r={dimpleR} fill={stroke} />
      <Circle cx={50} cy={35} r={dimpleR} fill={stroke} />
      <Circle cx={56} cy={34} r={dimpleR} fill={stroke} />

      {/* Tee cup (narrow, with a slight outward flare) */}
      <Path
        d="M46 46 Q46 50 48.5 51"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M51.5 51 Q54 50 54 46"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Line x1={46} y1={46} x2={54} y2={46} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />

      {/* Tapered shaft → pointed tip */}
      <Path
        d="M48.5 51 L49.6 86 L50 94 L50.4 86 L51.5 51"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
