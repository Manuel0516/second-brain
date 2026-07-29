import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { useSettings } from '../../context/settings'
import { SettingsNumberField } from './SettingsNumberField'

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
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="settings-number-grid">
            <SettingsNumberField
              id="settings-daily-meal-goal"
              label="Meals / day"
              min={1}
              max={20}
              suffix="meals"
              value={settings.food_daily_meal_goal}
              onCommit={(v) =>
                patch({
                  food_daily_meal_goal: v ?? settings.food_daily_meal_goal,
                })
              }
            />
            <SettingsNumberField
              id="settings-calorie-target"
              label="Calories"
              min={0}
              nullable
              suffix="kcal"
              value={settings.food_calorie_target}
              onCommit={(v) => patch({ food_calorie_target: v })}
            />
          </div>

          <div>
            <div className="settings-subgroup-label">Macros</div>
            <div className="settings-number-grid">
              <SettingsNumberField
                id="settings-protein-target"
                label="Protein"
                min={0}
                step={0.1}
                nullable
                suffix="g"
                value={settings.food_protein_target_g}
                onCommit={(v) => patch({ food_protein_target_g: v })}
              />
              <SettingsNumberField
                id="settings-carbs-target"
                label="Carbs"
                min={0}
                step={0.1}
                nullable
                suffix="g"
                value={settings.food_carbs_target_g}
                onCommit={(v) => patch({ food_carbs_target_g: v })}
              />
              <SettingsNumberField
                id="settings-fat-target"
                label="Fat"
                min={0}
                step={0.1}
                nullable
                suffix="g"
                value={settings.food_fat_target_g}
                onCommit={(v) => patch({ food_fat_target_g: v })}
              />
            </div>
          </div>

          <div>
            <div className="settings-subgroup-label">Daily units</div>
            <div className="settings-number-grid">
              <SettingsNumberField
                id="settings-water-target"
                label="Water"
                min={0}
                nullable
                suffix="units"
                value={settings.food_water_target_units}
                onCommit={(v) => patch({ food_water_target_units: v })}
              />
              <SettingsNumberField
                id="settings-veg-target"
                label="Vegetables"
                min={0}
                nullable
                suffix="units"
                value={settings.food_veg_target_units}
                onCommit={(v) => patch({ food_veg_target_units: v })}
              />
              <SettingsNumberField
                id="settings-fruit-target"
                label="Fruit"
                min={0}
                nullable
                suffix="units"
                value={settings.food_fruit_target_units}
                onCommit={(v) => patch({ food_fruit_target_units: v })}
              />
            </div>
          </div>
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
