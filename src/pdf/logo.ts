import { supabase } from '../lib/supabase'

// Descarga el logo del bucket privado 'branding' y lo devuelve como data URL (PNG o JPG).
export async function loadLogo(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('branding').download(path)
  if (error || !data) throw error ?? new Error('Logo no disponible')
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(data)
  })
}
