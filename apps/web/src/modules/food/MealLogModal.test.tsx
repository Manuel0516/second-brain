import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MealLogModal } from './MealLogModal'
import * as foodApi from './api'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    uploadFile: vi.fn(),
    analyzeMealLog: vi.fn(),
    createMealLog: vi.fn(),
    updateMealLog: vi.fn(),
  }
})

function meal(photoFileIds: string[]): foodApi.MealLog {
  return {
    id: 'meal-1',
    user_id: 'user-1',
    date: '2026-07-20T12:00:00Z',
    meal_type: 'lunch',
    slot_index: 0,
    status: 'logged',
    scheduled_at: null,
    logged_at: '2026-07-20T12:00:00Z',
    photo_file_ids: photoFileIds,
    calories: 500,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 20,
    water_units: 0,
    veg_units: 1,
    fruit_units: 0,
    notes: null,
    ai_items: null,
    created_at: '',
    updated_at: '',
  }
}

afterEach(() => vi.clearAllMocks())

describe('MealLogModal multi-photo behavior', () => {
  it('appends selected photos in order without automatically analyzing', async () => {
    vi.mocked(foodApi.uploadFile)
      .mockResolvedValueOnce({
        id: 'photo-3',
        url: '/api/files/photo-3',
        name: 'third.jpg',
        content_type: 'image/jpeg',
        size: 10,
        created_at: '',
      })
      .mockResolvedValueOnce({
        id: 'photo-4',
        url: '/api/files/photo-4',
        name: 'fourth.jpg',
        content_type: 'image/jpeg',
        size: 10,
        created_at: '',
      })

    render(
      <MealLogModal
        open
        onClose={vi.fn()}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1', 'photo-2'])}
      />,
    )

    const libraryInput = document.querySelector<HTMLInputElement>(
      'input[type="file"][multiple]',
    )!
    fireEvent.change(libraryInput, {
      target: {
        files: [
          new File(['3'], 'third.jpg', { type: 'image/jpeg' }),
          new File(['4'], 'fourth.jpg', { type: 'image/jpeg' }),
        ],
      },
    })

    expect(await screen.findByAltText('Meal dish 4')).toHaveAttribute(
      'src',
      '/api/files/photo-4',
    )
    expect(foodApi.uploadFile).toHaveBeenCalledTimes(2)
    expect(foodApi.analyzeMealLog).not.toHaveBeenCalled()
  })

  it('persists the ordered set before explicit combined analysis', async () => {
    vi.mocked(foodApi.updateMealLog).mockResolvedValue(
      meal(['photo-1', 'photo-2']),
    )
    vi.mocked(foodApi.analyzeMealLog).mockResolvedValue({
      ...meal(['photo-1', 'photo-2']),
      calories: 900,
    })

    render(
      <MealLogModal
        open
        onClose={vi.fn()}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1', 'photo-2'])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Analyze photos' }))

    await waitFor(() =>
      expect(foodApi.updateMealLog).toHaveBeenCalledWith('meal-1', {
        photo_file_ids: ['photo-1', 'photo-2'],
      }),
    )
    expect(foodApi.analyzeMealLog).toHaveBeenCalledWith('meal-1')
    expect(screen.getByDisplayValue('900')).toBeVisible()
  })

  it('removes a photo from the saved edit payload', async () => {
    vi.mocked(foodApi.updateMealLog).mockResolvedValue(meal(['photo-2']))
    const onSaved = vi.fn()
    render(
      <MealLogModal
        open
        onClose={vi.fn()}
        onSaved={onSaved}
        plannedMeal={meal(['photo-1', 'photo-2'])}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log meal' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(foodApi.updateMealLog).toHaveBeenCalledWith(
      'meal-1',
      expect.objectContaining({ photo_file_ids: ['photo-2'] }),
    )
  })
})

/** Stateful harness so a confirmed close actually flips `open`, exercising
 * the focus-restoration cleanup in useDialogFocus. */
function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button">Opener</button>
      <MealLogModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1'])}
      />
    </>
  )
}

describe('MealLogModal focus and dismissal', () => {
  it('focuses inside the dialog on open and labels it via aria-labelledby/describedby', async () => {
    render(
      <MealLogModal
        open
        onClose={vi.fn()}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1'])}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Log meal' })
    expect(dialog).toHaveAccessibleDescription('Log your planned meal')
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    )
  })

  it('traps Tab within the dialog', () => {
    render(
      <MealLogModal
        open
        onClose={vi.fn()}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1'])}
      />,
    )
    const dialog = screen.getByRole('dialog')
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input'),
    ).filter((el) => !el.hasAttribute('hidden'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('closes immediately on Escape when the form is clean', () => {
    const onClose = vi.fn()
    render(
      <MealLogModal
        open
        onClose={onClose}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1'])}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('counts an uploaded photo as dirty and confirms before Escape closes', async () => {
    vi.mocked(foodApi.uploadFile).mockResolvedValue({
      id: 'photo-9',
      url: '/api/files/photo-9',
      name: 'new.jpg',
      content_type: 'image/jpeg',
      size: 10,
      created_at: '',
    })
    const onClose = vi.fn()
    render(
      <MealLogModal
        open
        onClose={onClose}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1'])}
      />,
    )
    const libraryInput = document.querySelector<HTMLInputElement>(
      'input[type="file"][multiple]',
    )!
    fireEvent.change(libraryInput, {
      target: { files: [new File(['9'], 'new.jpg', { type: 'image/jpeg' })] },
    })
    await screen.findByAltText('Meal dish 2')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Analyze photos' }),
      ).toBeEnabled(),
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    const confirm = screen.getByRole('dialog', { name: 'Discard changes?' })

    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Keep editing' }),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByAltText('Meal dish 2')).toBeInTheDocument()
  })

  it('Discard changes closes the modal from the dirty-confirmation dialog', () => {
    const onClose = vi.fn()
    render(
      <MealLogModal
        open
        onClose={onClose}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1'])}
      />,
    )
    fireEvent.change(screen.getByLabelText('Calories'), {
      target: { value: '650' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    const confirm = screen.getByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Discard changes' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close or prompt on Escape while saving', async () => {
    vi.mocked(foodApi.updateMealLog).mockReturnValue(new Promise(() => {}))
    const onClose = vi.fn()
    render(
      <MealLogModal
        open
        onClose={onClose}
        onSaved={vi.fn()}
        plannedMeal={meal(['photo-1'])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Log meal' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).not.toBeInTheDocument()
  })

  it('a successful save closes without a dirty-confirmation prompt', async () => {
    vi.mocked(foodApi.updateMealLog).mockResolvedValue(meal(['photo-1']))
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(
      <MealLogModal
        open
        onClose={onClose}
        onSaved={onSaved}
        plannedMeal={meal(['photo-1'])}
      />,
    )
    fireEvent.change(screen.getByLabelText('Calories'), {
      target: { value: '650' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log meal' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).not.toBeInTheDocument()
  })

  it('restores focus to the opener once a confirmed close actually unmounts the dialog', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })
})
