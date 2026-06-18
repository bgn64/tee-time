/**
 * Phone-width framing.
 *
 * The Aurora design is a phone surface. On wide web/desktop viewports we
 * keep the app chrome in a centred column of this width so it reads as a
 * focused mobile experience (the global gradient + glow fill the gutters);
 * on real phones the screen is narrower than this, so the cap is a no-op
 * and everything is full-bleed.
 *
 * Centring is applied PER LAYER (the AppHeader bar, each screen's scroll
 * content, and the tab bar) — never by wrapping a navigator container,
 * which breaks react-native-screens' hiding of inactive scenes on web
 * (inactive tabs bleed through underneath the active one).
 */
export const PHONE_MAX_WIDTH = 480;
