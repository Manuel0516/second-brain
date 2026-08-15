import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders a heading', () => {
    render(<div>{renderMarkdown('## Plan')}</div>)
    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeTruthy()
  })

  it('renders a GFM table with header and body rows', () => {
    render(
      <div>
        {renderMarkdown(
          '| Day | Focus |\n| --- | --- |\n| Mon | Legs |\n| Wed | Push |',
        )}
      </div>,
    )
    expect(screen.getByRole('columnheader', { name: 'Focus' })).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('Legs')).toBeTruthy()
  })

  it('renders an ordered list starting from its first number', () => {
    render(<div>{renderMarkdown('2. Second\n3. Third')}</div>)
    const list = screen.getByRole('list') as HTMLOListElement
    expect(list.start).toBe(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('renders a safe link but drops an unsafe href', () => {
    render(
      <div>
        {renderMarkdown(
          '[docs](https://example.com) and [bad](javascript:void)',
        )}
      </div>,
    )
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
    expect(screen.getByText(/bad/)).toBeTruthy()
  })

  it('still renders bold/code and bullet lists as before', () => {
    render(<div>{renderMarkdown('**hi** `code`\n- one\n- two')}</div>)
    expect(screen.getByText('hi').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
