import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Field } from '../../components/Field'
import {
  wardrobeRequest,
  type Garment,
  type Outfit,
  type OutfitSuggestions,
} from './api'

export function OutfitAssistant({
  mode,
  embedded = false,
  date,
  onDateChange,
  calendarId,
  timezone,
  garments,
  onSaved,
}: {
  embedded?: boolean
  mode: 'outfits' | 'weather'
  date: string
  onDateChange: (value: string) => void
  calendarId: string
  timezone: string
  garments: Garment[]
  onSaved: () => Promise<void>
}) {
  const [occasion, setOccasion] = useState('')
  const [result, setResult] = useState<OutfitSuggestions | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Record<number, string>>({})
  const [planned, setPlanned] = useState<number[]>([])
  async function generate(event: FormEvent) {
    event.preventDefault()
    if (!date) {
      setError('Choose a planning date first')
      return
    }
    setBusy(true)
    setError('')
    try {
      setResult(
        await wardrobeRequest<OutfitSuggestions>('ai/suggestions', 'POST', {
          mode,
          date,
          occasion,
        }),
      )
      setSaved({})
      setPlanned([])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not generate outfits',
      )
    } finally {
      setBusy(false)
    }
  }
  async function accept(index: number, schedule: boolean) {
    if (!result) return
    setBusy(true)
    setError('')
    try {
      let id = saved[index]
      if (!id) {
        const outfit = await wardrobeRequest<Outfit>(
          'outfits',
          'POST',
          result.outfits[index],
        )
        id = outfit.id
        setSaved((prev) => ({ ...prev, [index]: id }))
      }
      if (schedule) {
        await wardrobeRequest('schedule', 'POST', {
          outfit_id: id,
          calendar_id: calendarId,
          date: result.date,
          timezone,
        })
        setPlanned((prev) => [...prev, index])
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save outfit')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="wardrobe-assistant"
      aria-label={
        mode === 'weather' ? 'Weather outfit planner' : 'AI outfit assistant'
      }
    >
      <form
        className={embedded ? 'wardrobe-ai-inline' : 'cal-card wardrobe-form'}
        onSubmit={generate}
      >
        <h2>
          {mode === 'weather'
            ? 'Weather suggestions'
            : 'Create outfits with AI'}
        </h2>
        <p>
          Uses your existing garments and{' '}
          <Link to="/settings/ai">AI settings</Link>. Review each suggestion
          before saving.
        </p>
        <fieldset disabled={busy}>
          <div className="wardrobe-fields">
            {!embedded && (
              <Field label="Outfit date">
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(event) => onDateChange(event.target.value)}
                />
              </Field>
            )}
            <Field label="Occasion or preferences">
              <input
                maxLength={500}
                value={occasion}
                onChange={(event) => setOccasion(event.target.value)}
                placeholder="e.g. office day, walking outdoors"
              />
            </Field>
          </div>
          <div className="cal-card-actions">
            <button className="primary" type="submit">
              {busy
                ? 'Working…'
                : mode === 'weather'
                  ? 'Suggest for weather'
                  : 'Suggest outfits'}
            </button>
          </div>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {result?.weather && (
        <div className="wardrobe-weather">
          <p>
            {result.weather.location} · {result.weather.date} ·{' '}
            {result.weather.min_c}–{result.weather.max_c} °C · Rain{' '}
            {result.weather.rain_probability}% · Wind {result.weather.wind_kmh}{' '}
            km/h
          </p>
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Weather by Open-Meteo
          </a>
        </div>
      )}
      {result && (
        <div className="wardrobe-day-context">
          <p>
            {result.calendar_events?.length
              ? `Considering your day: ${result.calendar_events.length} calendar events.`
              : 'No calendar events found for this day.'}
          </p>
          {Boolean(result.calendar_events?.length) && (
            <ul>
              {result.calendar_events?.map((event, index) => (
                <li key={index}>
                  {event.title}
                  {event.location ? ` · ${event.location}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && (
        <div className="wardrobe-ai-choices">
          {result.outfits.map((outfit, index) => (
            <article className="cal-card" key={index}>
              <h3>{outfit.name}</h3>
              <p>{outfit.notes}</p>
              <ul className="wardrobe-outfit-items">
                {outfit.garment_ids.map((id) => {
                  const item = garments.find((garment) => garment.id === id)
                  return item ? (
                    <li key={id}>
                      {item.photo_file_id && (
                        <img src={`/api/files/${item.photo_file_id}`} alt="" />
                      )}
                      <span>{item.name}</span>
                    </li>
                  ) : null
                })}
              </ul>
              <div className="cal-card-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || Boolean(saved[index])}
                  onClick={() => void accept(index, false)}
                >
                  {saved[index] ? 'Saved' : 'Save outfit'}
                </button>
                {mode === 'weather' && (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !calendarId || planned.includes(index)}
                    onClick={() => void accept(index, true)}
                  >
                    {planned.includes(index)
                      ? 'Scheduled'
                      : 'Save and schedule'}
                  </button>
                )}
              </div>
              {mode === 'weather' && !calendarId && (
                <p>Choose a local calendar before scheduling.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
