import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(async () => {
  cleanup()
  // ProseMirror's DOMObserver flush can land on a later macrotask than the
  // first one (e.g. a requestAnimationFrame tick, ~16ms). Under CI load a
  // single setTimeout(0) drain races that callback and JSDOM tears down the
  // document mid-flush ("document is not defined" unhandled error, flaky CI).
  // Wait a full animation frame so the flush lands while the document exists.
  await new Promise((resolve) => setTimeout(resolve, 40))
})
