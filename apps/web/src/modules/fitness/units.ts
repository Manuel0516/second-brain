import type { UserSettings } from '../../context/SettingsContext'

const KG_PER_LB = 0.45359237

export type WeightUnit = UserSettings['fitness_weight_unit']

/** Storage is always kg — convert only at the display/input boundary. */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const value = unit === 'lb' ? kg / KG_PER_LB : kg
  return Math.round(value * 10) / 10
}

export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value * KG_PER_LB : value
}
