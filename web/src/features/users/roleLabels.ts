/**
 * How the add-user page names a role the API sent. Display text only: what a role may do lives in
 * the API (D-96). A role this table does not know shows under its own name.
 */
const labels: Record<string, { label: string; hint: string }> = {
  scoreKeeper: { label: 'Score keeper', hint: 'Enters scores and sees who is bowling and where.' },
  director: {
    label: 'Tournament director',
    hint: 'Runs tournaments: everything except managing users.',
  },
  admin: { label: 'Admin', hint: 'Everything, including adding users.' },
}

export function roleLabel(role: string): { label: string; hint: string | undefined } {
  return labels[role] ?? { label: role, hint: undefined }
}
