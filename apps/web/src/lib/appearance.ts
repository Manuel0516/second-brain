export type ColorMode = 'system' | 'light' | 'dark'
export type VisualStyle = 'neon' | 'monochrome'

const VISUAL_STYLE_KEY = 'sb_visual_style'

/** Reads the cached visual style. Falls back to `neon` for missing/invalid values. */
export function readCachedVisualStyle(): VisualStyle {
  try {
    return window.localStorage.getItem(VISUAL_STYLE_KEY) === 'monochrome'
      ? 'monochrome'
      : 'neon'
  } catch {
    return 'neon'
  }
}

function writeCachedVisualStyle(style: VisualStyle) {
  try {
    window.localStorage.setItem(VISUAL_STYLE_KEY, style)
  } catch {
    // localStorage unavailable (private mode) — cache is a best-effort pre-paint hint only
  }
}

/** The brand logo asset for the given visual style — shared by the app rail and login screen. */
export function logoAssetFor(style: VisualStyle): string {
  return style === 'monochrome' ? '/logo-white.png' : '/logo-neon-planet.png'
}

/** The favicon asset for the given visual style and color mode. */
export function faviconAssetFor(
  style: VisualStyle,
  theme: ColorMode = 'system',
): string {
  if (style === 'neon') return '/logo-neon-planet.png'

  const light =
    theme === 'light' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches)
  return light ? '/favicon-monochrome-black.svg' : '/favicon-monochrome.png'
}

let transitionTimer = 0

function withOptionalTransition(animate: boolean, apply: () => void) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    window.clearTimeout(transitionTimer)
    transitionTimer = window.setTimeout(
      () => root.classList.remove('theme-transition'),
      400,
    )
  }
  apply()
}

/** Sets `data-theme`. Safe to call before settings load — `system` clears the attribute. */
export function applyTheme(theme: ColorMode, animate = false) {
  const root = document.documentElement
  const next = theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : ''
  const changed = (root.dataset.theme ?? '') !== next
  withOptionalTransition(animate && changed, () => {
    if (next) root.dataset.theme = next
    else delete root.dataset.theme
  })
  applyFavicon((root.dataset.visualStyle as VisualStyle) || 'neon')
}

function applyFavicon(style: VisualStyle) {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (link) {
    const theme: ColorMode =
      document.documentElement.dataset.theme === 'light'
        ? 'light'
        : document.documentElement.dataset.theme === 'dark'
          ? 'dark'
          : 'system'
    const href = faviconAssetFor(style, theme)
    link.href = href
    link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
  }
}

/** Sets `data-visual-style` and the favicon. Call pre-mount with the cached value to avoid a flash. */
export function applyVisualStyle(style: VisualStyle, animate = false) {
  const root = document.documentElement
  const changed = root.dataset.visualStyle !== style
  withOptionalTransition(animate && changed, () => {
    root.dataset.visualStyle = style
  })
  applyFavicon(style)
}

/**
 * Applies both appearance dimensions from an authoritative source (a loaded or
 * patched `/api/settings` response) and refreshes the pre-paint cache. The
 * backend is always authoritative — this must run after every successful load.
 */
export function applyBackendAppearance(
  theme: ColorMode,
  visualStyle: VisualStyle,
  animate = false,
) {
  applyTheme(theme, animate)
  applyVisualStyle(visualStyle, animate)
  writeCachedVisualStyle(visualStyle)
}

/**
 * Pre-mount bootstrap: applies the cached visual style synchronously so the
 * auth-loading screen and the login screen never flash the wrong branding
 * before `/api/settings` has a chance to load.
 */
export function applyCachedVisualStyleBeforeMount() {
  applyVisualStyle(readCachedVisualStyle())
}
