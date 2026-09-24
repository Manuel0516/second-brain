/* eslint-disable react-refresh/only-export-components -- standalone browser fixture */
import { createRoot } from 'react-dom/client'
import { SettingsProvider } from '../src/context/SettingsContext'
import { Overview as FitnessOverview } from '../src/modules/fitness/Overview'
import { Overview as FoodOverview } from '../src/modules/food/Overview'
import '../src/styles.css'
import '../src/modules/fitness/fitness.css'
import '../src/modules/food/food.css'

const now = new Date().toISOString()

// Keep the fixture hermetic: overview statistics/settings failures are expected
// here, while planned rows are supplied directly below.
window.fetch = async () => new Response('', { status: 404 })

function Fixture() {
  return (
    <SettingsProvider>
      <main style={{ minHeight: '180vh', padding: 16 }}>
        <FitnessOverview
          plannedSessions={[
            {
              id: 'e2e-workout',
              user_id: 'e2e-user',
              date: '2026-09-24',
              type: 'E2E workout',
              status: 'planned',
              scheduled_at: now,
              plan: [],
              notes: {},
              created_at: now,
              updated_at: now,
            },
          ]}
          onStartSession={() => {}}
          onPlanSession={() => {}}
          onDeleteSession={() => {
            document.body.dataset.workoutDeleted = 'true'
          }}
        />
        <div style={{ height: 520 }} />
        <FoodOverview
          summary={{
            days: [
              {
                date: '2026-09-24',
                calories_consumed: 0,
                protein_consumed: 0,
                carbs_consumed: 0,
                fat_consumed: 0,
                water_units: 0,
                veg_units: 0,
                fruit_units: 0,
                extras_water_units: 0,
                extras_veg_units: 0,
                extras_fruit_units: 0,
                meals_planned: 1,
                meals_logged: 0,
                meals: [
                  {
                    id: 'e2e-meal',
                    user_id: 'e2e-user',
                    date: '2026-09-24',
                    meal_type: 'e2e meal',
                    slot_index: 0,
                    status: 'planned',
                    scheduled_at: now,
                    logged_at: null,
                    photo_file_ids: [],
                    calories: null,
                    protein_g: null,
                    carbs_g: null,
                    fat_g: null,
                    water_units: 0,
                    veg_units: 0,
                    fruit_units: 0,
                    notes: null,
                    ai_items: null,
                    created_at: now,
                    updated_at: now,
                  },
                ],
              },
            ],
          }}
          weekOffset={0}
          onLogMeal={() => {}}
          onSaved={() => {}}
          onDeleteMeal={() => {
            document.body.dataset.mealDeleted = 'true'
          }}
        />
      </main>
    </SettingsProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)
