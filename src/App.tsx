import { NavLink, Route, Routes } from 'react-router-dom'
import AuthGate from './features/auth/AuthGate'
import QuotesList from './features/quotes/QuotesList'
import QuoteEditor from './features/quotes/QuoteEditor'
import ClientsPage from './features/clients/ClientsPage'
import CatalogPage from './features/catalog/CatalogPage'
import SettingsPage from './features/settings/SettingsPage'

export default function App() {
  return (
    <AuthGate>
      <main className="page">
        <Routes>
          <Route path="/" element={<QuotesList />} />
          <Route path="/quotes/new" element={<QuoteEditor />} />
          <Route path="/quotes/:id" element={<QuoteEditor />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/">Cotizaciones</NavLink>
        <NavLink to="/clients">Clientes</NavLink>
        <NavLink to="/catalog">Catálogo</NavLink>
        <NavLink to="/settings">Ajustes</NavLink>
      </nav>
    </AuthGate>
  )
}
