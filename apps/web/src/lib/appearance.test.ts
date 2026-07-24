import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  applyBackendAppearance,
  applyCachedVisualStyleBeforeMount,
  applyTheme,
  applyVisualStyle,
  faviconAssetFor,
  logoAssetFor,
  readCachedVisualStyle,
} from './appearance'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  })
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.visualStyle
  document.head.querySelector("link[rel='icon']")?.remove()
  const favicon = document.createElement('link')
  favicon.rel = 'icon'
  favicon.href = '/favicon-monochrome.png?v=20260724-white'
  document.head.appendChild(favicon)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('readCachedVisualStyle returns a valid cached value', () => {
  localStorage.setItem('sb_visual_style', 'monochrome')
  expect(readCachedVisualStyle()).toBe('monochrome')
})

test('readCachedVisualStyle falls back to neon for missing or invalid values', () => {
  expect(readCachedVisualStyle()).toBe('neon')
  localStorage.setItem('sb_visual_style', 'sepia')
  expect(readCachedVisualStyle()).toBe('neon')
})

test('applyCachedVisualStyleBeforeMount applies the cached value pre-mount', () => {
  localStorage.setItem('sb_visual_style', 'monochrome')
  applyCachedVisualStyleBeforeMount()
  expect(document.documentElement.dataset.visualStyle).toBe('monochrome')
})

test('applyVisualStyle sets data-visual-style on the root element', () => {
  applyVisualStyle('monochrome')
  expect(document.documentElement.dataset.visualStyle).toBe('monochrome')
  applyVisualStyle('neon')
  expect(document.documentElement.dataset.visualStyle).toBe('neon')
})

test('applyVisualStyle keeps a visible cache-busted favicon across appearance modes', () => {
  const favicon = () => document.querySelector("link[rel='icon']")

  applyTheme('light')
  applyVisualStyle('monochrome')
  expect(favicon()?.getAttribute('href')).toBe(
    '/favicon-monochrome.png?v=20260724-white',
  )
  expect(favicon()?.getAttribute('type')).toBe('image/png')

  applyTheme('dark')
  applyVisualStyle('monochrome')
  expect(favicon()?.getAttribute('href')).toBe(
    '/favicon-monochrome.png?v=20260724-white',
  )
  expect(favicon()?.getAttribute('type')).toBe('image/png')

  applyVisualStyle('neon')
  expect(favicon()?.getAttribute('href')).toBe(
    '/favicon-monochrome.png?v=20260724-white',
  )
  expect(favicon()?.getAttribute('type')).toBe('image/png')
})

test('logoAssetFor follows the active visual style', () => {
  expect(logoAssetFor('neon')).toBe('/logo-neon-planet.png')
  expect(logoAssetFor('monochrome')).toBe('/logo-white.png')
})

test('faviconAssetFor returns the browser-chrome-safe favicon', () => {
  expect(faviconAssetFor()).toBe('/favicon-monochrome.png?v=20260724-white')
})

test('applyBackendAppearance is authoritative and replaces a stale cache', () => {
  localStorage.setItem('sb_visual_style', 'monochrome')
  applyBackendAppearance('dark', 'neon')
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(document.documentElement.dataset.visualStyle).toBe('neon')
  expect(localStorage.setItem).toHaveBeenCalledWith('sb_visual_style', 'neon')
})
