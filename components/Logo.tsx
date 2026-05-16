/**
 * Tee Time logo, rendered as native SVG (react-native-svg).
 *
 * Two variants:
 *  - 'mark' (default) — the flat fairway-and-flag mark on a transparent
 *    background, the way the header used to look. Colors come from the
 *    active theme so it adapts to dark / light mode.
 *  - 'disc' — the full sunset disc: vertical sunset gradient, sun, mark
 *    inscribed on the horizon line, and the dark green outline ring.
 *    Sunset palette is hardcoded — the disc is the brand identity, not
 *    a theme token.
 *
 * The 'disc' variant is what the app header renders today; 'mark' is
 * preserved for any callers that want just the flat artwork.
 *
 * Static art equivalents live in:
 *   assets/logo/icon.svg          (disc variant)
 *   assets/logo/icon-ios.svg      (edge-to-edge variant for iOS icon)
 *   assets/logo/adaptive-icon.svg (edge-to-edge for Android adaptive)
 *   assets/logo/splash.svg        (disc + wordmark below)
 */

import { useId } from 'react';

import { useTheme } from '@/state/ThemeContext';
import { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Stop, Svg } from 'react-native-svg';

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

function MarkLogo({ size, color, ballFill }: { size: number; color?: string; ballFill?: string }) {
  const { colors } = useTheme();
  const darkGreen = color ?? colors.primaryDark;
  const lightGreen = colors.primary;
  const cutout = ballFill ?? colors.background;
  const cup = colors.textTitle;

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
      <Ellipse cx={368} cy={562} rx={24} ry={5.5} fill="#0b1f15" opacity={0.72} />
      <Path
        d="M368 324 C365 410 365 492 368 562"
        fill="none"
        stroke={cup}
        strokeWidth={14}
        strokeLinecap="round"
      />
      <Path
        d="M368 326 C416 308 456 328 500 310 L500 380 C450 402 416 382 371 398 C368 370 367 346 368 326 Z"
        fill={colors.accent}
      />
      <Path
        d="M388 341 C418 337 446 347 480 336 L480 366 C449 376 420 368 389 378 Z"
        fill="#f97066"
        opacity={0.5}
      />
    </Svg>
  );
}

function DiscLogo({ size }: { size: number }) {
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
          <Stop offset="0%" stopColor="#f8d4a0" />
          <Stop offset="38%" stopColor="#f4b27a" />
          <Stop offset="58%" stopColor="#a8c97b" />
          <Stop offset="100%" stopColor="#2f7d4b" />
        </LinearGradient>
        <ClipPath id={clipId}>
          <Circle cx={512} cy={512} r={500} />
        </ClipPath>
      </Defs>

      <Circle cx={512} cy={512} r={500} fill={`url(#${gradId})`} />

      <G clipPath={`url(#${clipId})`}>
        {/* Sun */}
        <Circle cx={720} cy={370} r={78} fill="#ffeacb" opacity={0.85} />
        <Circle cx={720} cy={370} r={50} fill="#fff3da" opacity={0.95} />

        {/* Fairway sweep */}
        <Path
          d="M126 644 C246 526 382 526 512 634 C642 742 782 728 900 606"
          fill="none"
          stroke="#2f7d4b"
          strokeWidth={92}
          strokeLinecap="round"
        />
        <Path
          d="M136 718 C274 626 412 632 544 720 C672 804 794 798 900 706"
          fill="none"
          stroke="#14543a"
          strokeWidth={36}
          strokeLinecap="round"
        />
        <Path
          d="M182 654 C304 590 420 602 534 676 C646 748 758 746 852 672"
          fill="none"
          stroke="#f6f7f2"
          strokeWidth={20}
          strokeLinecap="round"
          opacity={0.85}
        />

        {/* Cup */}
        <Ellipse cx={368} cy={564} rx={36} ry={10} fill="#123322" opacity={0.5} />
        <Ellipse cx={368} cy={562} rx={24} ry={5.5} fill="#0b1f15" opacity={0.72} />

        {/* Flagstick + flag */}
        <Path
          d="M368 324 C365 410 365 492 368 562"
          fill="none"
          stroke="#123322"
          strokeWidth={14}
          strokeLinecap="round"
        />
        <Path
          d="M368 326 C416 308 456 328 500 310 L500 380 C450 402 416 382 371 398 C368 370 367 346 368 326 Z"
          fill="#d94835"
        />
        <Path
          d="M388 341 C418 337 446 347 480 336 L480 366 C449 376 420 368 389 378 Z"
          fill="#f97066"
          opacity={0.5}
        />
      </G>

      {/* Disc outline ring */}
      <Circle cx={512} cy={512} r={500} fill="none" stroke="#0e3a26" strokeWidth={10} />
    </Svg>
  );
}
