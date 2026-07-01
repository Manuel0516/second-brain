import { render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { BlockEditor } from './BlockEditor'

test('renders task, table, and inline and block mathematics', async () => {
  const { container } = render(
    <BlockEditor
      onChange={vi.fn()}
      content={{
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Ship it' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Name' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath', attrs: { latex: 'x^2' } }],
          },
          { type: 'blockMath', attrs: { latex: '\\sum_i x_i' } },
        ],
      }}
    />,
  )

  expect(await screen.findByText('Ship it')).toBeVisible()
  expect(screen.getByRole('table')).toBeVisible()
  await waitFor(() =>
    expect(container.querySelectorAll('.katex')).toHaveLength(2),
  )
})
