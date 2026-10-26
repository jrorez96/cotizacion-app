import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { quoteCode } from '../lib/format'
import { MODE_LABEL, type Client, type Settings } from '../types/models'
import type { QuoteFull } from '../features/quotes/api'

export interface QuotePdfProps {
  settings: Settings; quote: QuoteFull; client: Client
  eventType: string | null; logo: string | null
}

// Helvetica estándar no incluye el símbolo ₡ ni el espacio fino de Intl: se usa el código ISO y espacios normales.
const num = (n: number) =>
  n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u00A0\u202F]/g, ' ')
const money = (n: number, cur: string) => `${cur} ${num(n)}`
const qty = (n: number) => (Number.isInteger(n) ? String(n) : num(n))
const date = (s: string | null) => (s ? s.split('-').reverse().join('/') : '-')

const makeStyles = (color: string) => StyleSheet.create({
  page: { padding: 36, paddingBottom: 56, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  logo: { width: 64, height: 64, objectFit: 'contain', marginRight: 12 },
  brand: { flexDirection: 'row', alignItems: 'center' },
  bizName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color },
  muted: { color: '#6b7280' },
  right: { textAlign: 'right' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color },
  bar: { height: 3, backgroundColor: color, marginBottom: 14 },
  cols: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  box: { flex: 1, padding: 10, backgroundColor: '#f3f4f6', borderRadius: 4 },
  boxTitle: { fontSize: 8, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' },
  bold: { fontFamily: 'Helvetica-Bold' },
  th: { flexDirection: 'row', backgroundColor: color, color: '#ffffff', padding: 6, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  cName: { flex: 4 }, cQty: { flex: 1.2, textAlign: 'right' },
  cPrice: { flex: 2, textAlign: 'right' }, cTotal: { flex: 2, textAlign: 'right' },
  totals: { marginTop: 12, marginLeft: 'auto', width: 230 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totBig: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, marginTop: 3,
    borderTopWidth: 1, borderTopColor: color, fontSize: 12, fontFamily: 'Helvetica-Bold', color },
  section: { marginTop: 16 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 3, color },
  footer: { position: 'absolute', left: 36, right: 36, bottom: 24, fontSize: 8, color: '#9ca3af',
    flexDirection: 'row', justifyContent: 'space-between' }
})

export default function QuotePdf({ settings, quote, client, eventType, logo }: QuotePdfProps) {
  const s = makeStyles(settings.primary_color || '#1f2937')
  const cur = settings.currency
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  const code = quoteCode(quote.number)
  const time = quote.start_time && quote.end_time
    ? `${quote.start_time.slice(0, 5)} a ${quote.end_time.slice(0, 5)}` : null

  return (
    <Document title={`Cotización ${code}`} author={settings.business_name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.brand}>
            {logo && <Image src={logo} style={s.logo} />}
            <View>
              <Text style={s.bizName}>{settings.business_name}</Text>
              {settings.address && <Text style={s.muted}>{settings.address}</Text>}
              {(settings.phone || settings.email) && (
                <Text style={s.muted}>{[settings.phone, settings.email].filter(Boolean).join('  |  ')}</Text>
              )}
            </View>
          </View>
          <View style={s.right}>
            <Text style={s.title}>COTIZACIÓN</Text>
            <Text style={s.bold}>{code}</Text>
            <Text style={s.muted}>Emitida: {date(quote.created_at.slice(0, 10))}</Text>
            <Text style={s.muted}>Válida hasta: {date(quote.valid_until)}</Text>
          </View>
        </View>
        <View style={s.bar} />

        <View style={s.cols}>
          <View style={s.box}>
            <Text style={s.boxTitle}>Cliente</Text>
            <Text style={s.bold}>{client.name}</Text>
            {client.company && <Text>{client.company}</Text>}
            {client.phone && <Text>{client.phone}</Text>}
            {client.email && <Text>{client.email}</Text>}
          </View>
          <View style={s.box}>
            <Text style={s.boxTitle}>Evento</Text>
            {eventType && <Text style={s.bold}>{eventType}</Text>}
            <Text>Fecha: {date(quote.event_date)}</Text>
            {time && <Text>Horario: {time}</Text>}
            {quote.guests ? <Text>Invitados: {quote.guests}</Text> : null}
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.cName}>Descripción</Text>
          <Text style={s.cQty}>Cant.</Text>
          <Text style={s.cPrice}>Precio unit.</Text>
          <Text style={s.cTotal}>Total</Text>
        </View>
        {items.map(i => (
          <View key={i.id} style={s.tr} wrap={false}>
            <View style={s.cName}>
              <Text>{i.name}</Text>
              <Text style={[s.muted, { fontSize: 8 }]}>{MODE_LABEL[i.pricing_mode]}</Text>
            </View>
            <Text style={s.cQty}>{qty(i.quantity)}</Text>
            <Text style={s.cPrice}>{money(i.unit_price, cur)}</Text>
            <Text style={s.cTotal}>{money(i.line_total, cur)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totRow}><Text>Subtotal</Text><Text>{money(quote.subtotal, cur)}</Text></View>
          {quote.discount_amount > 0 && (
            <View style={s.totRow}><Text>Descuento</Text><Text>- {money(quote.discount_amount, cur)}</Text></View>
          )}
          <View style={s.totRow}><Text>IVA ({quote.tax_rate}%)</Text><Text>{money(quote.tax_amount, cur)}</Text></View>
          <View style={s.totBig}><Text>TOTAL</Text><Text>{money(quote.total, cur)}</Text></View>
          <View style={s.totRow}>
            <Text>Adelanto para reservar ({quote.deposit_percent}%)</Text>
            <Text>{money(quote.deposit_amount, cur)}</Text>
          </View>
          <View style={s.totRow}>
            <Text>Saldo pendiente</Text>
            <Text>{money(quote.total - quote.deposit_amount, cur)}</Text>
          </View>
        </View>

        {quote.notes && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Notas</Text>
            <Text>{quote.notes}</Text>
          </View>
        )}
        {quote.terms && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Términos y condiciones</Text>
            <Text style={s.muted}>{quote.terms}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>{settings.business_name} · {code}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
