/**
 * Tee Time logo mark, rendered as native SVG (react-native-svg).
 *
 * Same artwork as `assets/logo/logo-mark.svg`, transcribed in JSX so the
 * mark can render inline in any RN view (the app header, the splash, etc.)
 * without going through the rasterized PNG assets.
 *
 * Green tones default to the active theme so the mark adapts to the user's
 * theme, while the red pin stays fixed to the selected brand direction.
 */

import { useTheme } from '@/state/ThemeContext';
import { Ellipse, Path, Svg } from 'react-native-svg';

export type LogoProps = {
  /** Edge length in pixels. Logo is square. */
  size?: number;
  /** Dark green stroke color. Defaults to theme primaryDark. */
  color?: string;
  /** Negative-space sweep color. Defaults to theme background. */
  ballFill?: string;
};

export function Logo({ size = 28, color, ballFill }: LogoProps) {
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
      <Ellipse cx={368} cy={562} rx={24} ry={5.5} fill="#14280f" opacity={0.72} />
      <Path
        d="M368 324 C365 410 365 492 368 562"
        fill="none"
        stroke={cup}
        strokeWidth={14}
        strokeLinecap="round"
      />
      <Path
        d="M368 326 C416 308 456 328 500 310 L500 380 C450 402 416 382 371 398 C368 370 367 346 368 326 Z"
        fill="#dc2626"
      />
      <Path
        d="M388 341 C418 337 446 347 480 336 L480 366 C449 376 420 368 389 378 Z"
        fill="#f97066"
        opacity={0.5}
      />
    </Svg>
  );
}
