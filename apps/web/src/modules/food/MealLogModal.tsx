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

type ModalState = 'empty' | 'camera' | 'result' | 'error'

const MAX_MEAL_PHOTOS = 15

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
  const [photoFileIds, setPhotoFileIds] = useState<string[]>(
    plannedMeal?.photo_file_ids ?? [],
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
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  // Reset state when modal opens with a planned meal or when modal closes
  function applyReset() {
    if (open) {
      if (plannedMeal) {
        setLogId(plannedMeal.id)
        setPhotoFileIds(plannedMeal.photo_file_ids)
        setFields(emptyFields(plannedMeal))
        setAiItems(plannedMeal.ai_items ?? null)
        setMealTypeSelection(
          (plannedMeal.meal_type as (typeof MEAL_TYPES)[number]) ??
            defaultMealType ??
            'breakfast',
        )
        setState('result')
        setErrorMsg(null)
        setMealDate(plannedMeal.date.slice(0, 10))
      } else {
        setLogId(null)
        setPhotoFileIds([])
        setFields(emptyFields(null))
        setAiItems(null)
        setMealTypeSelection(defaultMealType ?? 'breakfast')
        setState('empty')
        setErrorMsg(null)
        setMealDate(new Date().toISOString().slice(0, 10))
      }
      setUploading(false)
      setUploadProgress('')
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyReset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plannedMeal, defaultMealType])

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await handleFiles(files)
  }

  async function handleFiles(files: File[]) {
    if (uploading || analyzing) return
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    if (photoFileIds.length + images.length > MAX_MEAL_PHOTOS) {
      setState(photoFileIds.length > 0 || logId ? 'error' : 'empty')
      setErrorMsg(`A meal can have up to ${MAX_MEAL_PHOTOS} photos`)
      return
    }

    setState('result')
    setUploading(true)
    setErrorMsg(null)
    let nextPhotoIds = photoFileIds

    try {
      for (let index = 0; index < images.length; index += 1) {
        setUploadProgress(`Uploading ${index + 1} of ${images.length}…`)
        const uploaded = await uploadFile(images[index])
        nextPhotoIds = [...nextPhotoIds, uploaded.id]
        setPhotoFileIds(nextPhotoIds)
      }
    } catch (uploadErr) {
      setState('error')
      setErrorMsg(
        uploadErr instanceof Error
          ? uploadErr.message
          : 'Failed to upload photos',
      )
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  // Paste an image from the clipboard directly into the capture area
  useEffect(() => {
    if (!open || state === 'camera') return
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
      if (files.length > 0) {
        e.preventDefault()
        void handleFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state, photoFileIds, logId])

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
    void handleFiles(Array.from(e.dataTransfer.files ?? []))
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
    setState(photoFileIds.length > 0 || logId ? 'result' : 'empty')
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
        setState(photoFileIds.length > 0 || logId ? 'result' : 'empty')
        return
      }
      await handleFiles([
        new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }),
      ])
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
    setFields(emptyFields(plannedMeal))
    setAiItems(null)
    setState('result')
  }

  function updateField(field: keyof EditableFields, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }))
  }

  async function ensureLog(): Promise<string> {
    if (logId) return logId
    const created = await createMealLog({
      date: mealDate,
      meal_type: mealTypeSelection,
      status: 'planned',
      photo_file_ids: photoFileIds,
    })
    setLogId(created.id)
    return created.id
  }

  async function handleAnalyze() {
    if (photoFileIds.length === 0 || uploading) return
    setAnalyzing(true)
    setErrorMsg(null)
    try {
      const currentLogId = await ensureLog()
      await updateMealLog(currentLogId, { photo_file_ids: photoFileIds })
      const analyzed = await analyzeMealLog(currentLogId)
      setFields(emptyFields(analyzed))
      setAiItems(analyzed.ai_items ?? null)
      setState('result')
    } catch (analyzeErr) {
      setState('error')
      setErrorMsg(
        analyzeErr instanceof Error
          ? analyzeErr.message
          : 'Could not analyze photos',
      )
    } finally {
      setAnalyzing(false)
    }
  }

  function handleRemovePhoto(fileId: string) {
    setPhotoFileIds((current) => current.filter((id) => id !== fileId))
    setErrorMsg(null)
    setState('result')
  }

  async function handleSave() {
    setSaving(true)
    setErrorMsg(null)
    try {
      const currentLogId = await ensureLog()
      await updateMealLog(currentLogId, {
        date: mealDate,
        meal_type: mealTypeSelection,
        status: 'logged',
        photo_file_ids: photoFileIds,
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
      setState('error')
      setErrorMsg(
        saveErr instanceof Error ? saveErr.message : 'Failed to save meal log',
      )
    } finally {
      setSaving(false)
    }
  }

  function handleTryManual() {
    // Fall back to manual entry — keep the log and photos, let the user fill fields.
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
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          hidden
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelected}
          hidden
        />
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
              <span>Drag & drop or paste photos</span>
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
                  Upload photos
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
            {errorMsg && (
              <p className="food-meallog-photo-status" role="alert">
                {errorMsg}
              </p>
            )}
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

        {/* Result / Error (editable form) */}
        {isInModal && (
          <div className="food-meallog-result">
            <div
              className={`food-meallog-photos${isDragging ? ' dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="food-meallog-label">
                Photos · {photoFileIds.length}/{MAX_MEAL_PHOTOS}
              </div>
              {(photoFileIds.length > 0 || uploading) && (
                <div className="food-meallog-photo-list">
                  {photoFileIds.map((fileId, index) => (
                    <div className="food-meallog-photo-item" key={fileId}>
                      <img
                        src={`/api/files/${fileId}`}
                        alt={`Meal dish ${index + 1}`}
                        className="food-meallog-photo"
                      />
                      <span className="food-meallog-photo-order">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        className="food-meallog-photo-remove"
                        onClick={() => handleRemovePhoto(fileId)}
                        aria-label={`Remove photo ${index + 1}`}
                        disabled={uploading || analyzing}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {uploading && (
                    <div
                      className="food-meallog-photo-skeleton"
                      aria-hidden="true"
                    />
                  )}
                </div>
              )}
              <div className="food-meallog-photo-actions">
                <button
                  type="button"
                  className="food-secondary-button"
                  onClick={handleTakePhoto}
                  disabled={
                    uploading ||
                    analyzing ||
                    photoFileIds.length >= MAX_MEAL_PHOTOS
                  }
                >
                  Take another photo
                </button>
                <button
                  type="button"
                  className="food-secondary-button"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={
                    uploading ||
                    analyzing ||
                    photoFileIds.length >= MAX_MEAL_PHOTOS
                  }
                >
                  Add photos
                </button>
                <button
                  type="button"
                  className="food-primary-button"
                  onClick={handleAnalyze}
                  disabled={uploading || analyzing || photoFileIds.length === 0}
                >
                  {analyzing ? 'Analyzing…' : 'Analyze photos'}
                </button>
              </div>
              {uploading && (
                <p className="food-meallog-photo-status" role="status">
                  {uploadProgress}
                </p>
              )}
            </div>

            {/* Error banner */}
            {state === 'error' && (
              <div className="food-meallog-error-banner">
                <p>
                  Could not process photos
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
              className="food-primary-button food-meallog-save"
              disabled={saving || uploading || analyzing}
              onClick={handleSave}
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
