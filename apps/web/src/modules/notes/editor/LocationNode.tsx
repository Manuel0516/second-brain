import { Node, mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

/**
 * Location block: `{ address, lat, lng }` rendered as an OpenStreetMap embed
 * plus an address line. Zero dependencies — geocoding via a one-off Nominatim
 * fetch at insert time, map via an OSM iframe embed.
 */
export const LocationNode = Node.create({
  name: 'locationBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      address: { default: '' },
      lat: { default: 0 },
      lng: { default: 0 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-location]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const lat = Number(node.attrs.lat)
    const lng = Number(node.attrs.lng)
    const address = String(node.attrs.address)
    const d = 0.005
    const src =
      'https://www.openstreetmap.org/export/embed.html' +
      `?bbox=${lng - d},${lat - d},${lng + d},${lat + d}` +
      `&layer=mapnik&marker=${lat},${lng}`
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-location': '',
        class: 'notes-location',
      }),
      [
        'iframe',
        {
          src,
          class: 'notes-location-map',
          loading: 'lazy',
          title: address || 'Map',
        },
      ],
      ['p', { class: 'notes-location-address' }, address],
    ]
  },
})

/** Prompt for a place, geocode it, insert the block at the cursor. */
export async function insertLocation(editor: Editor): Promise<void> {
  const query = window.prompt('Search for a place or address')
  if (!query?.trim()) return
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } },
    )
    const results = (await response.json()) as {
      display_name?: string
      lat?: string
      lon?: string
    }[]
    const hit = results[0]
    if (!hit?.lat || !hit.lon) {
      window.alert('No results for that place.')
      return
    }
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'locationBlock',
        attrs: {
          address: hit.display_name ?? query,
          lat: Number(hit.lat),
          lng: Number(hit.lon),
        },
      })
      .run()
  } catch {
    window.alert('Could not look up that place.')
  }
}
