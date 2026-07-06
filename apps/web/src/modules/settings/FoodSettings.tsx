import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { useSettings } from '../../context/SettingsContext'

export function FoodSettings() {
  const { settings, patch } = useSettings()

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="settings-header">
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Food
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
          }}
        >
          Daily meal goal and nutrition targets.
        </p>
      </div>

      <SettingsCard title="Targets">
        <div style={{ display: 'grid', gap: 12 }}>
          <label className="cal-field" htmlFor="settings-daily-meal-goal">
            Daily meal goal
            <input
              id="settings-daily-meal-goal"
              type="number"
              min={1}
              max={20}
              value={settings.food_daily_meal_goal}
              onChange={(e) =>
                patch({ food_daily_meal_goal: Number(e.target.value) })
              }
            />
          </label>
          <label className="cal-field" htmlFor="settings-calorie-target">
            Calorie target (kcal)
            <input
              id="settings-calorie-target"
              type="number"
              min={0}
              value={settings.food_calorie_target ?? ''}
              onChange={(e) =>
                patch({
                  food_calorie_target: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className="cal-field" htmlFor="settings-protein-target">
            Protein target (g)
            <input
              id="settings-protein-target"
              type="number"
              min={0}
              step={0.1}
              value={settings.food_protein_target_g ?? ''}
              onChange={(e) =>
                patch({
                  food_protein_target_g: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className="cal-field" htmlFor="settings-carbs-target">
            Carbs target (g)
            <input
              id="settings-carbs-target"
              type="number"
              min={0}
              step={0.1}
              value={settings.food_carbs_target_g ?? ''}
              onChange={(e) =>
                patch({
                  food_carbs_target_g: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className="cal-field" htmlFor="settings-fat-target">
            Fat target (g)
            <input
              id="settings-fat-target"
              type="number"
              min={0}
              step={0.1}
              value={settings.food_fat_target_g ?? ''}
              onChange={(e) =>
                patch({
                  food_fat_target_g: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className="cal-field" htmlFor="settings-water-target">
            Water target (units)
            <input
              id="settings-water-target"
              type="number"
              min={0}
              value={settings.food_water_target_units ?? ''}
              onChange={(e) =>
                patch({
                  food_water_target_units: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className="cal-field" htmlFor="settings-veg-target">
            Vegetables target (units)
            <input
              id="settings-veg-target"
              type="number"
              min={0}
              value={settings.food_veg_target_units ?? ''}
              onChange={(e) =>
                patch({
                  food_veg_target_units: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className="cal-field" htmlFor="settings-fruit-target">
            Fruits target (units)
            <input
              id="settings-fruit-target"
              type="number"
              min={0}
              value={settings.food_fruit_target_units ?? ''}
              onChange={(e) =>
                patch({
                  food_fruit_target_units: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Stats"
        description="How far back the food stats graphs look."
      >
        <Segmented
          value={String(settings.food_stats_range_days)}
          options={['7', '30', '90', '180', '365']}
          labels={{
            '7': '1 week',
            '30': '1 month',
            '90': '3 months',
            '180': '6 months',
            '365': '1 year',
          }}
          onChange={(value) => patch({ food_stats_range_days: Number(value) })}
        />
      </SettingsCard>
    </div>
  )
}
