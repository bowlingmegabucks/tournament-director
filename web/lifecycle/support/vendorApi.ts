import { expect, request, type APIRequestContext } from '@playwright/test'
import { apiKey, apiUrl } from './stack'

/** What `GET /v1/tournaments/{id}` returns that the run needs (the vendor shape, API-04). */
export interface VendorTournament {
  id: string
  entryFee: number
  divisions: { id: string; name: string }[]
  squads: { id: string; date: string; entryFee: number | null }[]
  sweepers: { id: string; date: string; entryFee: number }[]
}

export interface VendorRegistration {
  tournamentId: string
  divisionId: string
  average: number | null
  squads: string[]
  sweepers: string[]
  superSweeper: boolean
  bowler: {
    firstName: string
    lastName: string
    address: { street: string; city: string; state: string; zipCode: string }
    email: string
    phoneNumber: string
    usbcId: string
    dateOfBirth: string
    gender: 'F' | 'M'
  }
  payment: { processingSystem: string; confirmationCode: string; amount: number } | null
}

/**
 * The registration site's view of the API: the vendor routes with the API key (rule 3). The same
 * context sends the key on every call, as the real site does.
 */
export class VendorApi {
  private constructor(private readonly context: APIRequestContext) {}

  static async open(): Promise<VendorApi> {
    return new VendorApi(
      await request.newContext({ baseURL: apiUrl, extraHTTPHeaders: { 'x-api-key': apiKey } }),
    )
  }

  async close(): Promise<void> {
    await this.context.dispose()
  }

  /** The tournament with this exact name, with its divisions, squads, and sweepers. */
  async tournament(name: string): Promise<VendorTournament> {
    const list = await this.context.get('/v1/tournaments')
    expect(list.ok()).toBe(true)
    const { tournaments } = (await list.json()) as { tournaments: { id: string; name: string }[] }
    const found = tournaments.find((tournament) => tournament.name === name)
    if (!found) throw new Error(`No tournament named ${name}`)
    const detail = await this.context.get(`/v1/tournaments/${found.id}`)
    expect(detail.ok()).toBe(true)
    return ((await detail.json()) as { tournament: VendorTournament }).tournament
  }

  /** `POST /v1/registrations` without a check on the answer, for a scripted failure. */
  async registerRaw(registration: VendorRegistration) {
    const response = await this.context.post('/v1/registrations', { data: { registration } })
    return { status: response.status(), body: await response.text() }
  }

  /** `POST /v1/registrations`: the registration id. The test fails on anything but a 201. */
  async register(registration: VendorRegistration): Promise<string> {
    const response = await this.context.post('/v1/registrations', { data: { registration } })
    expect(response.status(), await response.text()).toBe(201)
    return ((await response.json()) as { registrationId: string }).registrationId
  }
}
