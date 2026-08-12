import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(async () => {
  cleanup()
  // ProseMirror schedules a DOMObserver flush; let it finish before JSDOM
  // tears down the document used by the editor.
  await new Promise((resolve) => setTimeout(resolve, 0))
})
