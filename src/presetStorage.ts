import { normalizeDocument } from './data'
import type { EmailPreset } from './types'

const STORAGE_KEY = 'postcraft.email-presets.v1'

interface PresetStore {
  version: 1
  presets: EmailPreset[]
}

export function loadPresets(): EmailPreset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const store = JSON.parse(raw) as PresetStore
    if (store.version !== 1 || !Array.isArray(store.presets)) return []
    return store.presets.filter(preset => preset?.id && preset?.name && preset?.document).map(preset => ({ ...preset, document: normalizeDocument(preset.document) }))
  } catch {
    return []
  }
}

export function persistPresets(presets: EmailPreset[]) {
  const store: PresetStore = { version: 1, presets }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}
