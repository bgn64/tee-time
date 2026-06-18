/**
 * Tee Time logo, rendered as native SVG (react-native-svg).
 *
 * Ported from the legacy app's `components/Logo.tsx` so the brand
 * mark stays identical across both codebases. Only the
 * `useTheme` import path is changed to match this app's theme
 * provider location.
 *
 * Two variants:
 *  - 'mark' (default) — the flat fairway-and-flag mark on a
 *    transparent background. Colors come from the active theme so
 *    it adapts to dark / light mode.
 *  - 'disc' — the full Aurora disc: vertical lime/cyan gradient, sun,
 *    mark inscribed on the horizon line, and the dark green
 *    outline ring. Palette comes from Aurora tokens.
 *
 * The 'disc' variant is what the app header renders today; 'mark'
 * is preserved for any callers that want just the flat artwork.
 */

import { useId } from 'react';

import { useTheme } from '@/library/theme/ThemeContext';
import {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Stop,
  Svg,
} from 'react-native-svg';

export type LogoProps = {
  /** Edge length in pixels. Logo is square. */
  size?: number;
  /** 'mark' = flat fairway-and-flag, 'disc' = sunset disc. Default 'mark'. */
  variant?: 'mark' | 'disc';
  /** (mark only) Dark green stroke color. Defaults to theme primaryDark. */
  color?: string;
  /** (mark only) Negative-space sweep color. Defaults to theme background. */
  ballFill?: string;
};

export function Logo({ size = 28, variant = 'mark', color, ballFill }: LogoProps) {
  if (variant === 'disc') {
    return <DiscLogo size={size} />;
  }
  return <MarkLogo size={size} color={color} ballFill={ballFill} />;
}

function MarkLogo({
  size,
  color,
  ballFill,
}: {
  size: number;
  color?: string;
  ballFill?: string;
}) {
  const { colors } = useTheme();
  const darkGreen = color ?? colors.cyan;
  const lightGreen = colors.lime;
  const cutout = ballFill ?? colors.background;
  const cup = colors.onNeon;

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M126 644 C246 526 382 526 512 634 C642 742 782 728 900 606"
        fill="none"
        stroke={lightGreen}
        strokeWidth={92}
        strokeLinecap="round"
      />
      <Path
        d="M136 718 C274 626 412 632 544 720 C672 804 794 798 900 706"
        fill="none"
        stroke={darkGreen}
        strokeWidth={36}
        strokeLinecap="round"
      />
      <Path
        d="M182 654 C304 590 420 602 534 676 C646 748 758 746 852 672"
        fill="none"
        stroke={cutout}
        strokeWidth={20}
        strokeLinecap="round"
      />
      <Ellipse cx={368} cy={564} rx={36} ry={10} fill={cup} opacity={0.5} />
      <Ellipse cx={368} cy={562} rx={24} ry={5.5} fill={colors.onNeon} opacity={0.72} />
      <Path
        d="M368 324 C365 410 365 492 368 562"
        fill="none"
        stroke={cup}
        strokeWidth={14}
        strokeLinecap="round"
      />
      <Path
        d="M368 326 C416 308 456 328 500 310 L500 380 C450 402 416 382 371 398 C368 370 367 346 368 326 Z"
        fill={colors.cyan}
      />
      <Path
        d="M388 341 C418 337 446 347 480 336 L480 366 C449 376 420 368 389 378 Z"
        fill={colors.violet}
        opacity={0.5}
      />
    </Svg>
  );
}

function DiscLogo({ size }: { size: number }) {
  const { colors } = useTheme();
  // Generate per-instance IDs so multiple disc logos on the same screen
  // don't collide on the gradient / clip-path references (react-native-svg
  // has reuse bugs when ids clash across <Svg> roots on some platforms).
  const uid = useId().replace(/:/g, '');
  const gradId = `tt-sunset-${uid}`;
  const clipId = `tt-disc-${uid}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={colors.cyan} stopOpacity={0.95} />
          <Stop offset="38%" stopColor={colors.lime} stopOpacity={0.9} />
          <Stop offset="62%" stopColor={colors.nightTop} />
          <Stop offset="100%" stopColor={colors.nightViolet} />
        </LinearGradient>
        <ClipPath id={clipId}>
          <Circle cx={512} cy={512} r={500} />
        </ClipPath>
      </Defs>

      <Circle cx={512} cy={512} r={500} fill={`url(#${gradId})`} />

      <G clipPath={`url(#${clipId})`}>
        {/* Sun */}
        <Circle cx={720} cy={370} r={78} fill={colors.lime} opacity={0.32} />
        <Circle cx={720} cy={370} r={50} fill={colors.cyan} opacity={0.74} />

        {/* Fairway sweep */}
        <Path
          d="M126 644 C246 526 382 526 512 634 C642 742 782 728 900 606"
          fill="none"
          stroke={colors.lime}
          strokeWidth={92}
          strokeLinecap="round"
        />
        <Path
          d="M136 718 C274 626 412 632 544 720 C672 804 794 798 900 706"
          fill="none"
          stroke={colors.cyan}
          strokeWidth={36}
          strokeLinecap="round"
        />
        <Path
          d="M182 654 C304 590 420 602 534 676 C646 748 758 746 852 672"
          fill="none"
          stroke={colors.night}
          strokeWidth={20}
          strokeLinecap="round"
          opacity={0.85}
        />

        {/* Cup */}
        <Ellipse cx={368} cy={564} rx={36} ry={10} fill={colors.onNeon} opacity={0.5} />
        <Ellipse cx={368} cy={562} rx={24} ry={5.5} fill={colors.onNeon} opacity={0.72} />

        {/* Flagstick + flag */}
        <Path
          d="M368 324 C365 410 365 492 368 562"
          fill="none"
          stroke={colors.onNeon}
          strokeWidth={14}
          strokeLinecap="round"
        />
        <Path
          d="M368 326 C416 308 456 328 500 310 L500 380 C450 402 416 382 371 398 C368 370 367 346 368 326 Z"
          fill={colors.cyan}
        />
        <Path
          d="M388 341 C418 337 446 347 480 336 L480 366 C449 376 420 368 389 378 Z"
          fill={colors.violet}
          opacity={0.5}
        />
      </G>

      {/* Disc outline ring */}
      <Circle cx={512} cy={512} r={500} fill="none" stroke={colors.lime} strokeWidth={10} opacity={0.72} />
    </Svg>
  );
}
