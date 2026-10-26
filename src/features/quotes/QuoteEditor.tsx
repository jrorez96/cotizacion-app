import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { calcTotals, type DiscountType } from '../../lib/calc'
import { money, quoteCode } from '../../lib/format'
import { MODE_LABEL, STATUS_LABEL, type CatalogItem, type PricingMode, type QuoteStatus } from '../../types/models'
import { useCatalog, useClients, useEventTypes, useQuote, useSettings } from './api'
import { buildQuotePdf, downloadFile, shareFile } from '../../pdf/exportQuote'

interface Line {
  key: string; catalog_item_id: string | null; name: string
  pricing_mode: PricingMode; unit_price: number; quantity: number
}

const uid = () => Math.random().toString(36).slice(2)

function hoursBetween(a: string, b: string) {
  if (!a || !b) return 1
  const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number)
  let mins = bh * 60 + bm - (ah * 60 + am)
  if (mins <= 0) mins += 24 * 60
  return Math.round((mins / 60) * 100) / 100
}

function defaultQty(mode: PricingMode, guests: number, hours: number) {
  if (mode === 'per_person' || mode === 'per_unit') return guests || 1
  if (mode === 'per_hour') return hours
  return 1
}

export default function QuoteEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { data: clients } = useClients()
  const { data: eventTypes } = useEventTypes()
  const { data: catalog } = useCatalog()
  const { data: quote } = useQuote(id)

  const [form, setForm] = useState({
    client_id: '', event_type_id: '', event_date: '', start_time: '', end_time: '',
    guests: '', discount_type: 'none' as DiscountType, discount_value: '', notes: '',
    status: 'draft' as QuoteStatus
  })
  const [lines, setLines] = useState<Line[]>([])
  const [newClient, setNewClient] = useState<{ name: string; phone: string; email: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [makingPdf, setMakingPdf] = useState(false)

  // Si algo cambia, el PDF generado queda obsoleto
  useEffect(() => { setPdfFile(null) }, [form, lines])

  // Hidratar al abrir una cotización existente
  useEffect(() => {
    if (!quote) return
    setForm({
      client_id: quote.client_id, event_type_id: quote.event_type_id ?? '',
      event_date: quote.event_date ?? '', start_time: quote.start_time?.slice(0, 5) ?? '',
      end_time: quote.end_time?.slice(0, 5) ?? '', guests: quote.guests?.toString() ?? '',
      discount_type: quote.discount_type, discount_value: quote.discount_value ? String(quote.discount_value) : '',
      notes: quote.notes ?? '', status: quote.status
    })
    setLines([...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order).map(i => ({
      key: i.id, catalog_item_id: i.catalog_item_id, name: i.name,
      pricing_mode: i.pricing_mode, unit_price: i.unit_price, quantity: i.quantity
    })))
  }, [quote])

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const guests = Number(form.guests) || 0
  const hours = hoursBetween(form.start_time, form.end_time)

  const onGuests = (v: string) => {
    set('guests', v)
    const g = Number(v) || 0
    // Sincroniza las líneas "por persona" con el nuevo número de invitados
    setLines(ls => ls.map(l => l.pricing_mode === 'per_person' ? { ...l, quantity: g || 1 } : l))
  }

  const addFromCatalog = (itemId: string) => {
    const it = catalog?.find((c: CatalogItem) => c.id === itemId)
    if (!it) return
    setLines(ls => [...ls, {
      key: uid(), catalog_item_id: it.id, name: it.name, pricing_mode: it.pricing_mode,
      unit_price: it.unit_price, quantity: defaultQty(it.pricing_mode, guests, hours)
    }])
  }
  const addCustom = () =>
    setLines(ls => [...ls, { key: uid(), catalog_item_id: null, name: '', pricing_mode: 'fixed', unit_price: 0, quantity: 1 }])
  const patchLine = (key: string, p: Partial<Line>) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...p } : l))
  const removeLine = (key: string) => setLines(ls => ls.filter(l => l.key !== key))

  const taxRate = quote?.tax_rate ?? settings?.tax_rate ?? 0
  const depositPct = quote?.deposit_percent ?? settings?.deposit_percent ?? 0
  const totals = useMemo(
    () => calcTotals(lines, form.discount_type, Number(form.discount_value) || 0, taxRate, depositPct),
    [lines, form.discount_type, form.discount_value, taxRate, depositPct]
  )
  const cur = settings?.currency

  async function createClient() {
    if (!newClient?.name.trim()) return
    const { data, error } = await supabase.from('clients')
      .insert({ name: newClient.name.trim(), phone: newClient.phone || null, email: newClient.email || null })
      .select('id').single()
    if (error) return setError(error.message)
    await qc.invalidateQueries({ queryKey: ['clients'] })
    set('client_id', data.id); setNewClient(null)
  }

  async function save(): Promise<string | null> {
    setError('')
    const fail = (m: string) => { setError(m); return null }
    if (!form.client_id) return fail('Selecciona o crea un cliente')
    if (!lines.length) return fail('Agrega al menos un ítem')
    if (lines.some(l => !l.name.trim())) return fail('Todos los ítems necesitan nombre')
    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id, event_type_id: form.event_type_id || null,
        event_date: form.event_date || null, start_time: form.start_time || null, end_time: form.end_time || null,
        guests: guests || null, discount_type: form.discount_type,
        discount_value: Number(form.discount_value) || 0, notes: form.notes || null, status: form.status
      }
      let quoteId = id
      if (id) {
        const u = await supabase.from('quotes').update(payload).eq('id', id)
        if (u.error) throw u.error
        const d = await supabase.from('quote_items').delete().eq('quote_id', id)
        if (d.error) throw d.error
      } else {
        const ins = await supabase.from('quotes').insert(payload).select('id').single()
        if (ins.error) throw ins.error
        quoteId = ins.data.id
      }
      const rows = lines.map((l, i) => ({
        quote_id: quoteId, catalog_item_id: l.catalog_item_id, name: l.name.trim(),
        pricing_mode: l.pricing_mode, unit_price: l.unit_price, quantity: l.quantity, sort_order: i
      }))
      const it = await supabase.from('quote_items').insert(rows)
      if (it.error) throw it.error
      await qc.invalidateQueries({ queryKey: ['quotes'] })
      await qc.invalidateQueries({ queryKey: ['quote', quoteId] })
      if (!id) navigate(`/quotes/${quoteId}`, { replace: true })
      return quoteId as string
    } catch (e) {
      return fail((e as Error).message || 'Error al guardar')
    } finally { setSaving(false) }
  }

  async function makePdf() {
    const qid = await save()
    if (!qid) return
    setMakingPdf(true)
    try { setPdfFile(await buildQuotePdf(qid)) }
    catch (e) { setError((e as Error).message || 'No se pudo generar el PDF') }
    finally { setMakingPdf(false) }
  }

  return (
    <>
      <h1>{quote ? quoteCode(quote.number) : 'Nueva cotización'}</h1>

      <section className="card">
        <label>Cliente
          <select value={form.client_id} onChange={e => set('client_id', e.target.value)}>
            <option value="">Seleccionar…</option>
            {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {newClient ? (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <input placeholder="Nombre" value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} />
            <input placeholder="Teléfono" value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} />
            <input placeholder="Correo" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
            <div className="grid2">
              <button onClick={createClient}>Guardar cliente</button>
              <button className="ghost" onClick={() => setNewClient(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => setNewClient({ name: '', phone: '', email: '' })}>+ Nuevo cliente</button>
        )}
      </section>

      <section className="card">
        <label>Tipo de evento
          <select value={form.event_type_id} onChange={e => set('event_type_id', e.target.value)}>
            <option value="">—</option>
            {eventTypes?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="grid2" style={{ marginTop: 8 }}>
          <label>Fecha<input type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)} /></label>
          <label>Invitados<input type="number" inputMode="numeric" min={1} value={form.guests} onChange={e => onGuests(e.target.value)} /></label>
          <label>Inicio<input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} /></label>
          <label>Fin<input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} /></label>
        </div>
      </section>

      <h2>Ítems</h2>
      {lines.map(l => (
        <div className="card" key={l.key}>
          <input placeholder="Descripción del ítem" value={l.name} onChange={e => patchLine(l.key, { name: e.target.value })} />
          <div className="grid2" style={{ marginTop: 8 }}>
            <label>Cantidad ({MODE_LABEL[l.pricing_mode]})
              <input type="number" inputMode="decimal" min={0} step="any" value={l.quantity || ''}
                onChange={e => patchLine(l.key, { quantity: parseFloat(e.target.value) || 0 })} />
            </label>
            <label>Precio unitario
              <input type="number" inputMode="decimal" min={0} step="any" value={l.unit_price || ''}
                onChange={e => patchLine(l.key, { unit_price: parseFloat(e.target.value) || 0 })} />
            </label>
          </div>
          <div className="tot" style={{ marginTop: 8 }}>
            <button className="ghost" onClick={() => removeLine(l.key)}>Quitar</button>
            <strong>{money(Math.round(l.quantity * l.unit_price * 100) / 100, cur)}</strong>
          </div>
        </div>
      ))}
      <div className="card">
        <label>Agregar desde el catálogo
          <select value="" onChange={e => addFromCatalog(e.target.value)}>
            <option value="">Seleccionar ítem…</option>
            {catalog?.map(c => (
              <option key={c.id} value={c.id}>{c.name} · {money(c.unit_price, cur)} {MODE_LABEL[c.pricing_mode]}</option>
            ))}
          </select>
        </label>
        <button className="ghost" style={{ marginTop: 8 }} onClick={addCustom}>+ Ítem personalizado</button>
      </div>

      <section className="card">
        <div className="grid2">
          <label>Descuento
            <select value={form.discount_type} onChange={e => set('discount_type', e.target.value)}>
              <option value="none">Sin descuento</option>
              <option value="percent">Porcentaje (%)</option>
              <option value="fixed">Monto fijo</option>
            </select>
          </label>
          <label>Valor
            <input type="number" inputMode="decimal" min={0} step="any" disabled={form.discount_type === 'none'}
              value={form.discount_value} onChange={e => set('discount_value', e.target.value)} />
          </label>
        </div>
        <label style={{ marginTop: 8 }}>Notas
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </label>
        {id && (
          <label style={{ marginTop: 8 }}>Estado
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {(Object.keys(STATUS_LABEL) as QuoteStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="card">
        <div className="tot"><span>Subtotal</span><span>{money(totals.subtotal, cur)}</span></div>
        {totals.discount > 0 && <div className="tot"><span>Descuento</span><span>−{money(totals.discount, cur)}</span></div>}
        <div className="tot"><span>IVA ({taxRate}%)</span><span>{money(totals.tax, cur)}</span></div>
        <div className="tot big"><span>Total</span><span>{money(totals.total, cur)}</span></div>
        <div className="tot"><span>Adelanto ({depositPct}%)</span><span>{money(totals.deposit, cur)}</span></div>
      </section>

      {id && (
        <section className="card">
          <button className="ghost" style={{ width: '100%' }} disabled={makingPdf || saving} onClick={makePdf}>
            {makingPdf ? 'Generando PDF…' : pdfFile ? 'Regenerar PDF' : 'Guardar y generar PDF'}
          </button>
          {pdfFile && (
            <div className="grid2" style={{ marginTop: 8 }}>
              <button onClick={() => shareFile(pdfFile).catch(e => setError((e as Error).message))}>Compartir</button>
              <button className="ghost" onClick={() => downloadFile(pdfFile)}>Descargar</button>
            </div>
          )}
        </section>
      )}

      {error && <p className="err" role="alert">{error}</p>}
      <button style={{ width: '100%' }} disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar cotización'}</button>
    </>
  )
}
