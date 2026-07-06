import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Field } from '../../components/Field'
import {
  uploadFile,
  analyzeMealLog,
  createMealLog,
  updateMealLog,
  type MealLog,
} from './api'

interface MealLogModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  plannedMeal?: MealLog | null
  defaultMealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

type ModalState =
  | 'empty'
  | 'camera'
  | 'uploading'
  | 'analyzing'
  | 'result'
  | 'error'

interface EditableFields {
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
  water_units: string
  veg_units: string
  fruit_units: string
  notes: string
}

function emptyFields(meal?: MealLog | null): EditableFields {
  return {
    calories: meal?.calories != null ? String(meal.calories) : '',
    protein_g: meal?.protein_g != null ? String(meal.protein_g) : '',
    carbs_g: meal?.carbs_g != null ? String(meal.carbs_g) : '',
    fat_g: meal?.fat_g != null ? String(meal.fat_g) : '',
    water_units: meal?.water_units != null ? String(meal.water_units) : '0',
    veg_units: meal?.veg_units != null ? String(meal.veg_units) : '0',
    fruit_units: meal?.fruit_units != null ? String(meal.fruit_units) : '0',
    notes: meal?.notes ?? '',
  }
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const

export function MealLogModal({
  open,
  onClose,
  onSaved,
  plannedMeal,
  defaultMealType,
}: MealLogModalProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<ModalState>('empty')
  const [logId, setLogId] = useState<string | null>(plannedMeal?.id ?? null)
  const [photoFileId, setPhotoFileId] = useState<string | null>(
    plannedMeal?.photo_file_id ?? null,
  )
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    plannedMeal?.photo_file_id
      ? `/api/files/${plannedMeal.photo_file_id}`
      : null,
  )
  const [fields, setFields] = useState<EditableFields>(emptyFields(plannedMeal))
  const [aiItems, setAiItems] = useState<Record<string, unknown>[] | null>(
    plannedMeal?.ai_items ?? null,
  )
  const [aiItemsOpen, setAiItemsOpen] = useState(false)
  const [mealTypeSelection, setMealTypeSelection] = useState(
    plannedMeal
      ? (plannedMeal.meal_type as (typeof MEAL_TYPES)[number])
      : (defaultMealType ?? 'breakfast'),
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mealDate, setMealDate] = useState(
    plannedMeal?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  )
  const [isDragging, setIsDragging] = useState(false)

  // Reset state when modal opens with a planned meal or when modal closes
  function applyReset() {
    if (open) {
      if (plannedMeal) {
        setLogId(plannedMeal.id)
        setPhotoFileId(plannedMeal.photo_file_id)
        setPhotoUrl(
          plannedMeal.photo_file_id
            ? `/api/files/${plannedMeal.photo_file_id}`
            : null,
        )
        setFields(emptyFields(plannedMeal))
        setAiItems(plannedMeal.ai_items ?? null)
        setMealTypeSelection(
          (plannedMeal.meal_type as (typeof MEAL_TYPES)[number]) ??
            defaultMealType ??
            'breakfast',
        )
        setState(plannedMeal.photo_file_id ? 'result' : 'empty')
        setErrorMsg(null)
        setMealDate(plannedMeal.date.slice(0, 10))
      } else {
        setLogId(null)
        setPhotoFileId(null)
        setPhotoUrl(null)
        setFields(emptyFields(null))
        setAiItems(null)
        setMealTypeSelection(defaultMealType ?? 'breakfast')
        setState('empty')
        setErrorMsg(null)
        setMealDate(new Date().toISOString().slice(0, 10))
      }
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyReset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plannedMeal, defaultMealType])

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await handleFile(file)
  }

  async function handleFile(file: File) {
    setState('uploading')
    setErrorMsg(null)

    try {
      const uploaded = await uploadFile(file)
      setPhotoFileId(uploaded.id)
      setPhotoUrl(`/api/files/${uploaded.id}`)

      setState('analyzing')

      // Create log if not already linked to a planned meal
      let currentLogId = logId
      if (!currentLogId) {
        const created = await createMealLog({
          date: mealDate,
          meal_type: mealTypeSelection,
          status: 'planned',
        })
        currentLogId = created.id
        setLogId(currentLogId)
      }

      try {
        const analyzed = await analyzeMealLog(currentLogId, uploaded.id)
        setFields({
          calories: analyzed.calories != null ? String(analyzed.calories) : '',
          protein_g:
            analyzed.protein_g != null ? String(analyzed.protein_g) : '',
          carbs_g: analyzed.carbs_g != null ? String(analyzed.carbs_g) : '',
          fat_g: analyzed.fat_g != null ? String(analyzed.fat_g) : '',
          water_units:
            analyzed.water_units != null ? String(analyzed.water_units) : '0',
          veg_units:
            analyzed.veg_units != null ? String(analyzed.veg_units) : '0',
          fruit_units:
            analyzed.fruit_units != null ? String(analyzed.fruit_units) : '0',
          notes: analyzed.notes ?? '',
        })
        setAiItems(analyzed.ai_items ?? null)
        setState('result')
      } catch (analyzeErr) {
        // Backend guarantees the meal log is NOT modified on analysis failure.
        // Stay in result-like state but show error and let user fill manually.
        setState('error')
        setErrorMsg(
          analyzeErr instanceof Error
            ? analyzeErr.message
            : 'Could not analyze photo',
        )
      }
    } catch (uploadErr) {
      setState('error')
      setErrorMsg(
        uploadErr instanceof Error
          ? uploadErr.message
          : 'Failed to upload photo',
      )
    }
  }

  // Paste an image from the clipboard directly into the capture area
  useEffect(() => {
    if (!open || state !== 'empty') return
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file) {
        e.preventDefault()
        void handleFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state])

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function handleTakePhoto() {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      setState('camera')
    } catch {
      // Permission denied or no camera available — fall back to the file picker.
      cameraInputRef.current?.click()
    }
  }

  function handleCancelCamera() {
    stopCamera()
    setState('empty')
  }

  async function handleCapturePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    stopCamera()
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setState('empty')
        return
      }
      await handleFile(
        new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }),
      )
    }, 'image/jpeg')
  }

  // Attach the live stream once the <video> element mounts for the 'camera' state.
  useEffect(() => {
    if (state === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [state])

  // Make sure the camera stream is always released when the modal closes.
  useEffect(() => {
    if (!open) stopCamera()
    return () => stopCamera()
  }, [open])

  async function handleLogManually() {
    setErrorMsg(null)
    let currentLogId = logId
    if (!currentLogId) {
      try {
        const created = await createMealLog({
          date: mealDate,
          meal_type: mealTypeSelection,
          status: 'planned',
        })
        currentLogId = created.id
        setLogId(currentLogId)
      } catch {
        setErrorMsg('Could not create meal log')
        return
      }
    }
    setPhotoFileId(null)
    setPhotoUrl(null)
    setFields(emptyFields(plannedMeal))
    setAiItems(null)
    setState('result')
  }

  function updateField(field: keyof EditableFields, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!logId) return
    setSaving(true)
    setErrorMsg(null)
    try {
      await updateMealLog(logId, {
        date: mealDate,
        meal_type: mealTypeSelection,
        status: 'logged',
        photo_file_id: photoFileId,
        calories: fields.calories ? parseFloat(fields.calories) : null,
        protein_g: fields.protein_g ? parseFloat(fields.protein_g) : null,
        carbs_g: fields.carbs_g ? parseFloat(fields.carbs_g) : null,
        fat_g: fields.fat_g ? parseFloat(fields.fat_g) : null,
        water_units: parseInt(fields.water_units, 10) || 0,
        veg_units: parseInt(fields.veg_units, 10) || 0,
        fruit_units: parseInt(fields.fruit_units, 10) || 0,
        notes: fields.notes || null,
        ai_items: aiItems,
      })
      onSaved()
      onClose()
    } catch (saveErr) {
      setErrorMsg(
        saveErr instanceof Error ? saveErr.message : 'Failed to save meal log',
      )
    } finally {
      setSaving(false)
    }
  }

  function handleTryManual() {
    // Fall back to manual entry — keep the logId and photo, let user fill fields
    setState('result')
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  const isInModal = state === 'result' || state === 'error'

  return createPortal(
    <div
      className="food-meallog-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      role="presentation"
    >
      <div
        className="food-meallog-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Log meal"
      >
        {/* Header */}
        <div className="food-meallog-header">
          <div>
            <h3>Log meal</h3>
            <p>
              {plannedMeal
                ? 'Log your planned meal'
                : 'Take a photo or enter details manually'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="food-meallog-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Empty state */}
        {state === 'empty' && (
          <div className="food-meallog-capture">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelected}
              style={{ display: 'none' }}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              style={{ display: 'none' }}
            />
            <div
              className={`food-meallog-capture-area${isDragging ? ' dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span>Drag & drop or paste a photo</span>
              <span className="food-meallog-capture-hint">
                or choose an option below
              </span>
              <div className="food-meallog-capture-choices">
                <button
                  type="button"
                  className="food-secondary-button"
                  onClick={handleTakePhoto}
                >
                  Take photo
                </button>
                <button
                  type="button"
                  className="food-secondary-button"
                  onClick={() => libraryInputRef.current?.click()}
                >
                  Upload photo
                </button>
              </div>
            </div>
            <button
              type="button"
              className="food-meallog-manual-btn"
              onClick={handleLogManually}
            >
              Log manually
            </button>
          </div>
        )}

        {/* Live camera preview */}
        {state === 'camera' && (
          <div className="food-meallog-capture">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="food-meallog-camera-preview"
            />
            <div className="food-meallog-capture-choices">
              <button
                type="button"
                className="food-secondary-button"
                onClick={handleCancelCamera}
              >
                Cancel
              </button>
              <button
                type="button"
                className="food-primary-button"
                onClick={handleCapturePhoto}
              >
                Capture
              </button>
            </div>
          </div>
        )}

        {/* Uploading */}
        {state === 'uploading' && (
          <div className="food-meallog-status">
            <div className="food-meallog-spinner" />
            <p>Uploading photo…</p>
          </div>
        )}

        {/* Analyzing */}
        {state === 'analyzing' && (
          <div className="food-meallog-status">
            <div className="food-meallog-spinner" />
            <p>Analyzing with AI…</p>
          </div>
        )}

        {/* Result / Error (editable form) */}
        {isInModal && (
          <div
            className="food-meallog-result"
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* Photo thumbnail */}
            {photoUrl && (
              <img src={photoUrl} alt="Meal" className="food-meallog-photo" />
            )}

            {/* Error banner */}
            {state === 'error' && (
              <div className="food-meallog-error-banner">
                <p>
                  Could not analyze photo
                  {errorMsg ? `: ${errorMsg}` : ''}
                </p>
                <button
                  type="button"
                  className="food-secondary-button"
                  onClick={handleTryManual}
                >
                  Try manual entry
                </button>
              </div>
            )}

            {/* Date */}
            <Field label="Date">
              <input
                type="date"
                value={mealDate}
                onChange={(e) => setMealDate(e.target.value)}
                disabled={!!plannedMeal}
                className="food-meallog-input"
              />
            </Field>

            {/* Meal type selector */}
            <div>
              <div className="food-meallog-label">Meal type</div>
              <div className="food-meallog-pills">
                {MEAL_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setMealTypeSelection(t)}
                    className={`food-meallog-type-pill${mealTypeSelection === t ? ' active' : ''}`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Editable fields */}
            <div className="food-meallog-fields">
              <Field label="Calories">
                <input
                  type="number"
                  value={fields.calories}
                  onChange={(e) => updateField('calories', e.target.value)}
                  placeholder="0"
                  className="food-meallog-input"
                />
              </Field>
              <Field label="Protein (g)">
                <input
                  type="number"
                  value={fields.protein_g}
                  onChange={(e) => updateField('protein_g', e.target.value)}
                  placeholder="0"
                  className="food-meallog-input"
                />
              </Field>
              <Field label="Carbs (g)">
                <input
                  type="number"
                  value={fields.carbs_g}
                  onChange={(e) => updateField('carbs_g', e.target.value)}
                  placeholder="0"
                  className="food-meallog-input"
                />
              </Field>
              <Field label="Fat (g)">
                <input
                  type="number"
                  value={fields.fat_g}
                  onChange={(e) => updateField('fat_g', e.target.value)}
                  placeholder="0"
                  className="food-meallog-input"
                />
              </Field>
              <Field label="Water (units)">
                <input
                  type="number"
                  value={fields.water_units}
                  onChange={(e) => updateField('water_units', e.target.value)}
                  placeholder="0"
                  className="food-meallog-input"
                />
              </Field>
              <Field label="Vegetables (portions)">
                <input
                  type="number"
                  value={fields.veg_units}
                  onChange={(e) => updateField('veg_units', e.target.value)}
                  placeholder="0"
                  className="food-meallog-input"
                />
              </Field>
              <Field label="Fruits (portions)">
                <input
                  type="number"
                  value={fields.fruit_units}
                  onChange={(e) => updateField('fruit_units', e.target.value)}
                  placeholder="0"
                  className="food-meallog-input"
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={fields.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Optional notes about this meal…"
                className="food-meallog-textarea"
              />
            </Field>

            {/* AI items (collapsible) */}
            {aiItems && aiItems.length > 0 && (
              <div className="food-meallog-ai-items">
                <button
                  type="button"
                  className="food-meallog-ai-toggle"
                  onClick={() => setAiItemsOpen((v) => !v)}
                >
                  <span>AI-detected items ({aiItems.length})</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{
                      transform: aiItemsOpen
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <path d="M5 7l5 5 5-5" />
                  </svg>
                </button>
                {aiItemsOpen && (
                  <div className="food-meallog-ai-list">
                    {aiItems.map((item, i) => (
                      <div key={i} className="food-meallog-ai-row">
                        <span className="food-meallog-ai-name">
                          {String(item.name ?? `Item ${i + 1}`)}
                        </span>
                        {item.quantity != null && (
                          <span className="food-meallog-ai-qty">
                            ×{String(item.quantity)}
                          </span>
                        )}
                        {item.calories != null && (
                          <span className="food-meallog-ai-stat">
                            {String(item.calories)} kcal
                          </span>
                        )}
                        {item.protein != null && (
                          <span className="food-meallog-ai-stat">
                            {String(item.protein)}g P
                          </span>
                        )}
                        {item.carbs != null && (
                          <span className="food-meallog-ai-stat">
                            {String(item.carbs)}g C
                          </span>
                        )}
                        {item.fat != null && (
                          <span className="food-meallog-ai-stat">
                            {String(item.fat)}g F
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Save button */}
            <button
              type="button"
              className="food-primary-button"
              disabled={saving}
              onClick={handleSave}
              style={{ width: '100%', height: '42px' }}
            >
              {saving ? 'Saving…' : plannedMeal ? 'Log meal' : 'Save meal'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
