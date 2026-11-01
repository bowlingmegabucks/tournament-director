/**
 * The roles a user can hold (D-97). Better Auth stores one of these names on the user. The
 * permissions that go with each role arrive with the role table (stage 2, step 5).
 */
export const roleNames = ['scoreKeeper', 'director', 'admin'] as const

export type RoleName = (typeof roleNames)[number]
