// Calendar category palette — events, tags, calendars. See docs/design/STYLE_GUIDE.md.
export const COLOR_PRESETS = [
  '#3B6FE0',
  '#2E9E6E',
  '#D6932B',
  '#8B5CF6',
  '#D9573F',
]

// Pick a legible on-color for a swatch's icon/ring. Very light colors get a
// mid-gray (not black) so the selection ring stays distinct from the dark app
// background instead of blending into it; everything else uses cream.
export function onColor(hex: string) {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#f0ede5'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.72 ? '#a8a298' : '#f0ede5'
}
