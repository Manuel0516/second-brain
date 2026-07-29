export function normalizeHref(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const href =
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
      ? trimmed
      : `https://${trimmed}`
  try {
    const protocol = new URL(href, window.location.origin).protocol
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol) ||
      href.startsWith('#')
      ? href
      : null
  } catch {
    return null
  }
}
