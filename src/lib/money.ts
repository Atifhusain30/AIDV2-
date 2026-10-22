/** Display a dollar amount: "$95" for whole dollars, "$162.50" otherwise. */
export const formatPrice = (amount: number) => `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
