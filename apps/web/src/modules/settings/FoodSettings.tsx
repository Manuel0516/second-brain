import { useRef } from 'react'
import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { DEFAULTS, useSettings } from '../../context/SettingsContext'
import { SettingsNumberField } from './SettingsNumberField'
import {
  SettingsTextField,
  type SettingsTextFieldHandle,
} from './SettingsTextField'

export function FoodSettings() {
  const { settings, patch } = useSettings()
  const promptFieldRef = useRef<SettingsTextFieldHandle>(null)

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

      <SettingsCard
        title="AI photo analysis"
        description="Model used to estimate calories and macros from a meal photo."
      >
        <SettingsTextField
          id="settings-food-analyze-model"
          label="OpenRouter model"
          value={settings.food_analyze_model}
          onCommit={(food_analyze_model) => patch({ food_analyze_model })}
        />
      </SettingsCard>

      <SettingsCard
        title="Analysis prompt"
        description="Sent to the model together with the photo. Must still ask for JSON output."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <SettingsTextField
            ref={promptFieldRef}
            id="settings-food-analyze-prompt"
            label="Prompt"
            value={settings.food_analyze_prompt}
            onCommit={(food_analyze_prompt) => patch({ food_analyze_prompt })}
            multiline
            prompt
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="settings-card-save"
              type="button"
              onClick={() => promptFieldRef.current?.commit()}
            >
              Save prompt
            </button>
            <button
              className="settings-card-save"
              type="button"
              onClick={() =>
                void patch({
                  food_analyze_prompt: DEFAULTS.food_analyze_prompt,
                })
              }
            >
              Reset to default
            </button>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
