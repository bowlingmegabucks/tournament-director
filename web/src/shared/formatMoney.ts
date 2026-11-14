const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Money text from the API (`"1250.5"`) as dollars and cents: `$1,250.50`. Text that is not a number comes back as it was. */
export function formatMoney(amount: string): string {
  const value = Number(amount)
  return Number.isFinite(value) && amount.trim() !== '' ? dollars.format(value) : amount
}
