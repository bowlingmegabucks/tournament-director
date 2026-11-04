import { noEditFacts, type EditInfo } from './editFacts.ts'
import type {
  Tournament,
  TournamentRatios,
  TournamentSettings,
  TournamentSettingsView,
} from './types.ts'

/** What routes need from storage. A database version replaces the in-memory one without touching routes. */
export interface TournamentRepository {
  list(): Promise<Tournament[]>
  get(id: string): Promise<Tournament | undefined>
  /** The finals and super sweeper cash ratios (RES-12, RES-28). `undefined` for an unknown id. */
  getRatios(id: string): Promise<TournamentRatios | undefined>
  /** Games, the three ratios, and the completed flag (D-126, D-131). `undefined` for an unknown id. */
  getSettings(id: string): Promise<TournamentSettingsView | undefined>
  /** What depends on the settings, for the edit page (D-131). `undefined` for an unknown id. */
  getEditInfo(id: string): Promise<EditInfo | undefined>
}

const defaultSettings: TournamentSettings = {
  games: 5,
  finalsRatio: 8,
  cashRatio: 5,
  superSweeperCashRatio: 8,
}

const defaultRatios: TournamentRatios = { finalsRatio: 8, superSweeperCashRatio: 8 }

export function createInMemoryTournamentRepository(
  seed: Tournament[],
  ratios: Record<string, TournamentRatios> = {},
  settings: Record<string, TournamentSettings & { completed?: boolean }> = {},
  editInfo: Record<string, EditInfo> = {},
): TournamentRepository {
  return {
    // Return copies so callers cannot change the stored data.
    list: () => Promise.resolve(seed.map((tournament) => ({ ...tournament }))),
    get: (id) => {
      const found = seed.find((tournament) => tournament.id === id)
      return Promise.resolve(found && { ...found })
    },
    getRatios: (id) => {
      const found = seed.some((tournament) => tournament.id === id)
      return Promise.resolve(found ? { ...(ratios[id] ?? defaultRatios) } : undefined)
    },
    getSettings: (id) => {
      const found = seed.some((tournament) => tournament.id === id)
      return Promise.resolve(
        found ? { completed: false, ...(settings[id] ?? defaultSettings) } : undefined,
      )
    },
    getEditInfo: (id) => {
      const found = seed.some((tournament) => tournament.id === id)
      const { registrationCount, hasScores, hasSweeperScores } = editInfo[id] ?? noEditFacts
      return Promise.resolve(found ? { registrationCount, hasScores, hasSweeperScores } : undefined)
    },
  }
}
