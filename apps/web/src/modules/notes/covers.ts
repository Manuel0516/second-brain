/** Preset cover tokens stored in pages.cover as "gradient:N". */
export const COVER_PRESETS = [1, 2, 3, 4, 5, 6] as const

export function coverClass(cover: string): string {
  const match = /^gradient:(\d+)$/.exec(cover)
  return match ? `notes-cover-g${match[1]}` : ''
}
