import { pdf } from '@react-pdf/renderer'
import { supabase } from '../lib/supabase'
import { quoteCode } from '../lib/format'
import type { QuoteFull } from '../features/quotes/api'
import type { Client, EventType, Settings } from '../types/models'
import QuotePdf from './QuotePdf'
import { loadLogo } from './logo'

// Lee los datos frescos (con totales calculados por la base de datos), genera el PDF y guarda una copia.
export async function buildQuotePdf(quoteId: string): Promise<File> {
  const q = await supabase.from('quotes').select('*, quote_items(*)').eq('id', quoteId).single()
  if (q.error) throw new Error(q.error.message)
  const quote = q.data as QuoteFull

  const s = await supabase.from('business_settings').select('*').single()
  if (s.error) throw new Error(s.error.message)
  const settings = s.data as Settings

  const c = await supabase.from('clients').select('*').eq('id', quote.client_id).single()
  if (c.error) throw new Error(c.error.message)

  let eventType: string | null = null
  if (quote.event_type_id) {
    const t = await supabase.from('event_types').select('*').eq('id', quote.event_type_id).single()
    eventType = (t.data as EventType | null)?.name ?? null
  }

  const logo = settings.logo_path ? await loadLogo(settings.logo_path).catch(() => null) : null

  const blob = await pdf(
    <QuotePdf settings={settings} quote={quote} client={c.data as Client} eventType={eventType} logo={logo} />
  ).toBlob()
  const file = new File([blob], `${quoteCode(quote.number)}.pdf`, { type: 'application/pdf' })

  try { // copia en Storage: opcional, no debe romper la generación
    const { data: u } = await supabase.auth.getUser()
    if (u.user) {
      const path = `${u.user.id}/${file.name}`
      const up = await supabase.storage.from('quotes').upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (!up.error) await supabase.from('quotes').update({ pdf_path: path }).eq('id', quoteId)
    }
  } catch { /* ignorar */ }

  return file
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Hoja nativa de compartir (WhatsApp, correo...). Si el dispositivo no lo soporta, descarga el archivo.
export async function shareFile(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') throw e
    }
  } else {
    downloadFile(file)
  }
}
