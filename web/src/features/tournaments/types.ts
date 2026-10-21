/** The vendor summary shape (`API-03`, `API-04`). The API's `types.ts` has the same fields: change both together. */
export interface Tournament {
  id: string
  name: string
  /** `YYYY-MM-DD` */
  startDate: string
  /** `YYYY-MM-DD` */
  endDate: string
  entryFee: number
  bowlingCenter: string
}
