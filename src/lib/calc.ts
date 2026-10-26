// Espejo en cliente de los triggers SQL: solo para vista previa en vivo.
// La fuente de verdad son los totales guardados por la base de datos.
export type DiscountType = 'none' | 'percent' | 'fixed'
export interface LineInput { quantity: number; unit_price: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function calcTotals(
  lines: LineInput[], discountType: DiscountType, discountValue: number,
  taxRate: number, depositPercent: number
) {
  const subtotal = r2(lines.reduce((s, l) => s + r2(l.quantity * l.unit_price), 0))
  const discount =
    discountType === 'percent' ? r2((subtotal * discountValue) / 100)
    : discountType === 'fixed' ? Math.min(discountValue, subtotal) : 0
  const tax = r2(((subtotal - discount) * taxRate) / 100)
  const total = r2(subtotal - discount + tax)
  return { subtotal, discount, tax, total, deposit: r2((total * depositPercent) / 100) }
}
