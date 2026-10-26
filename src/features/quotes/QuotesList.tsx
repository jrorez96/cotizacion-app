import { Link } from 'react-router-dom'
import { money, quoteCode } from '../../lib/format'
import { STATUS_LABEL } from '../../types/models'
import { useQuotes, useSettings } from './api'

export default function QuotesList() {
  const { data: quotes, isLoading, error } = useQuotes()
  const { data: settings } = useSettings()

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Cotizaciones</h1>
        <Link to="/quotes/new"><button>+ Nueva</button></Link>
      </div>
      {isLoading && <p>Cargando…</p>}
      {error && <p className="err">{(error as Error).message}</p>}
      {quotes?.length === 0 && <p>Aún no hay cotizaciones. Crea la primera.</p>}
      {quotes?.map(q => (
        <Link key={q.id} to={`/quotes/${q.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card">
            <div className="tot">
              <strong>{quoteCode(q.number)} · {q.clients?.name ?? 'Sin cliente'}</strong>
              <span className={`badge ${q.status}`}>{STATUS_LABEL[q.status]}</span>
            </div>
            <div className="tot">
              <span>{q.event_date ?? 'Sin fecha'}</span>
              <strong>{money(q.total, settings?.currency)}</strong>
            </div>
          </div>
        </Link>
      ))}
    </>
  )
}
