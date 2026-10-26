export const money = (n: number, currency = 'CRC') =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)

export const quoteCode = (n: number) => `COT-${String(n).padStart(4, '0')}`
