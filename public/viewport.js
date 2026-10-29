/** Camera units: one current player diameter = 36 world coordinates.
 * Keep 19 player widths visible; adapt height from 8 to 15 (baseline 10).
 * Excess panel area becomes letterbox/pillarbox space, never extra world view.
 */
function calculateViewport(width, height, mode = 'web') {
  const worldWidth = 19 * 36;
  const portrait = height > width;
  const worldHeight = portrait && mode === 'web' ? 10 * 36 : Math.max(8 * 36, Math.min(15 * 36, worldWidth * height / width));
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const pixelWidth = worldWidth * scale, pixelHeight = worldHeight * scale;
  return { worldWidth, worldHeight, scale, pixelWidth, pixelHeight,
    left: (width - pixelWidth) / 2, top: (height - pixelHeight) / 2,
    portrait, blockedPortrait: portrait && mode === 'app' };
}
