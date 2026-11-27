/**
 * iPhone launch screens for the home-screen app (apple-touch-startup-image).
 * iOS shows a white screen on launch unless an image matching the exact device size is linked.
 * Sizes are CSS points × device pixel ratio, portrait only (the manifest locks portrait).
 */
export const SPLASH_DEVICES = [
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max, 17 Pro Max
  { w: 420, h: 912, dpr: 3 }, // Air
  { w: 402, h: 874, dpr: 3 }, // 16 Pro, 17, 17 Pro
  { w: 430, h: 932, dpr: 3 }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { w: 393, h: 852, dpr: 3 }, // 14 Pro, 15, 15 Pro, 16, 16e
  { w: 428, h: 926, dpr: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 390, h: 844, dpr: 3 }, // 12, 13, 14, 12/13 Pro
  { w: 375, h: 812, dpr: 3 }, // X, XS, 11 Pro, 12/13 mini
  { w: 414, h: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // XR, 11
  { w: 414, h: 736, dpr: 3 }, // 6/7/8 Plus
  { w: 375, h: 667, dpr: 2 }, // SE 2/3, 6/7/8
] as const;

export const splashFile = (d: (typeof SPLASH_DEVICES)[number]) => `${d.w * d.dpr}x${d.h * d.dpr}.png`;

export const splashStartupImages = SPLASH_DEVICES.map((d) => ({
  url: `/splash/${splashFile(d)}`,
  media: `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`,
}));
