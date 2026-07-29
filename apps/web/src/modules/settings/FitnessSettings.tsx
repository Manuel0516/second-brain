import { Segmented } from '../../components/Segmented'
import { SettingsCard } from '../../components/SettingsCard'
import { ToggleRow } from '../../components/ToggleRow'
import { useSettings } from '../../context/settings'
import { SettingsNumberField } from './SettingsNumberField'

export function FitnessSettings() {
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
          Fitness
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
          }}
        >
          Rest timer, units, and weekly training targets.
        </p>
      </div>

      <SettingsCard title="Rest timer">
        <div style={{ display: 'grid', gap: 12 }}>
          <SettingsNumberField
            id="settings-rest-seconds"
            label="Rest duration"
            min={10}
            max={600}
            suffix="seconds"
            value={settings.fitness_rest_seconds}
            onCommit={(v) =>
              patch({
                fitness_rest_seconds: v ?? settings.fitness_rest_seconds,
              })
            }
          />
          <ToggleRow
            label="Auto-start rest timer after a set"
            checked={settings.fitness_auto_start_rest}
            onChange={(v) => patch({ fitness_auto_start_rest: v })}
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Units">
        <Segmented
          value={settings.fitness_weight_unit}
          options={['kg', 'lb']}
          onChange={(fitness_weight_unit) => patch({ fitness_weight_unit })}
        />
      </SettingsCard>

      <SettingsCard
        title="Weekly target"
        description="Number of sessions you aim to complete each week. Leave empty to hide progress."
      >
        <SettingsNumberField
          id="settings-weekly-target"
          label="Sessions per week"
          min={0}
          max={14}
          nullable
          suffix="sessions"
          value={settings.fitness_weekly_session_target}
          onCommit={(v) => patch({ fitness_weekly_session_target: v })}
        />
      </SettingsCard>

      <SettingsCard
        title="Stats"
        description="How far back the fitness graphs (overview and exercise progression) look."
      >
        <Segmented
          value={String(settings.fitness_stats_range_days)}
          options={['7', '30', '90', '180', '365']}
          labels={{
            '7': '1 week',
            '30': '1 month',
            '90': '3 months',
            '180': '6 months',
            '365': '1 year',
          }}
          onChange={(value) =>
            patch({ fitness_stats_range_days: Number(value) })
          }
        />
      </SettingsCard>
    </div>
  )
}
