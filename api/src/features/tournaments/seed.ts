import type { Tournament } from './types.ts'

/** Starter data until a database exists. */
export const seedTournaments: Tournament[] = [
  {
    id: '3f6c1b0e-6a52-4c1d-9d0e-2f6b7a1c8e01',
    name: 'Spring Open',
    date: '2026-04-18',
    entrants: 64,
  },
  {
    id: '8b2d4e7a-1c35-4f9a-a6b8-5d3e9c0f7b02',
    name: 'Summer Classic',
    date: '2026-07-11',
    entrants: 96,
  },
  {
    id: 'c9a1f5d3-7e48-4b26-8c0d-1a4e6b9d2f03',
    name: 'Fall Championship',
    date: '2026-10-24',
    entrants: 128,
  },
]
