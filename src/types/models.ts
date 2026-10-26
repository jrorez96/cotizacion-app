export type PricingMode = 'fixed' | 'per_person' | 'per_hour' | 'per_unit'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'

export interface Settings {
  business_name: string; logo_path: string | null; primary_color: string
  email: string | null; phone: string | null; address: string | null
  currency: string; tax_rate: number; deposit_percent: number
  validity_days: number; terms: string
}
export interface Client { id: string; name: string; email: string | null; phone: string | null; company: string | null }
export interface EventType { id: string; name: string }
export interface CatalogItem {
  id: string; name: string; description: string | null; category: string | null
  pricing_mode: PricingMode; unit_price: number
}
export interface QuoteItem {
  id: string; quote_id: string; catalog_item_id: string | null; name: string; description: string | null
  pricing_mode: PricingMode; unit_price: number; quantity: number; line_total: number; sort_order: number
}
export interface Quote {
  id: string; number: number; client_id: string; event_type_id: string | null; status: QuoteStatus
  event_date: string | null; start_time: string | null; end_time: string | null; guests: number | null
  discount_type: 'none' | 'percent' | 'fixed'; discount_value: number
  tax_rate: number; deposit_percent: number
  subtotal: number; discount_amount: number; tax_amount: number; total: number; deposit_amount: number
  valid_until: string | null; notes: string | null; terms: string | null; pdf_path: string | null
  created_at: string
}

export const MODE_LABEL: Record<PricingMode, string> = {
  fixed: 'precio fijo', per_person: 'por persona', per_hour: 'por hora', per_unit: 'por unidad'
}
export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', expired: 'Vencida'
}
