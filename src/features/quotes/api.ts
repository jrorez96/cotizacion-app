import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { CatalogItem, Client, EventType, Quote, QuoteItem, Settings } from '../../types/models'

function unwrap<T>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: async () =>
    unwrap<Settings>(await supabase.from('business_settings').select('*').single()) })

export const useClients = () =>
  useQuery({ queryKey: ['clients'], queryFn: async () =>
    unwrap<Client[]>(await supabase.from('clients').select('*').order('name')) })

export const useEventTypes = () =>
  useQuery({ queryKey: ['event_types'], queryFn: async () =>
    unwrap<EventType[]>(await supabase.from('event_types').select('*').order('name')) })

export const useCatalog = () =>
  useQuery({ queryKey: ['catalog'], queryFn: async () =>
    unwrap<CatalogItem[]>(
      await supabase.from('catalog_items').select('*').eq('active', true).order('category').order('name')) })

export type QuoteRow = Quote & { clients: { name: string } | null }
export const useQuotes = () =>
  useQuery({ queryKey: ['quotes'], queryFn: async () =>
    unwrap<QuoteRow[]>(
      await supabase.from('quotes').select('*, clients(name)').order('created_at', { ascending: false })) })

export type QuoteFull = Quote & { quote_items: QuoteItem[] }
export const useQuote = (id?: string) =>
  useQuery({
    queryKey: ['quote', id], enabled: !!id,
    queryFn: async () => unwrap<QuoteFull>(
      await supabase.from('quotes').select('*, quote_items(*)').eq('id', id!).single())
  })
