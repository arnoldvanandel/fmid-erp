import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ArtikelenList from './pages/artikelen/ArtikelenList'
import LeveranciersList from './pages/leveranciers/LeveranciersList'
import KlantenList from './pages/klanten/KlantenList'
import InkoopordersList from './pages/inkooporders/InkoopordersList'
import InkooporderAfdruk from './pages/inkooporders/InkooporderAfdruk'
import VerkoopordersList from './pages/verkooporders/VerkoopordersList'
import FacturenList from './pages/verkooporders/FacturenList'
import VerkoopAfdruk from './pages/verkooporders/VerkoopAfdruk'
import VoorraadOverzicht from './pages/voorraad/VoorraadOverzicht'
import ProductieordersList from './pages/productieorders/ProductieordersList'
import LocatiesBeheer from './pages/locaties/LocatiesBeheer'
import Gebruikersbeheer from './pages/gebruikers/Gebruikersbeheer'

function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }
  if (user) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/artikelen"
            element={
              <ProtectedRoute>
                <Layout>
                  <ArtikelenList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/klanten"
            element={
              <ProtectedRoute>
                <Layout>
                  <KlantenList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/leveranciers"
            element={
              <ProtectedRoute>
                <Layout>
                  <LeveranciersList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inkooporders"
            element={
              <ProtectedRoute>
                <Layout>
                  <InkoopordersList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inkooporders/:id/afdruk"
            element={
              <ProtectedRoute>
                <InkooporderAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verkooporders"
            element={
              <ProtectedRoute>
                <Layout>
                  <VerkoopordersList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/facturen"
            element={
              <ProtectedRoute>
                <Layout>
                  <FacturenList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/verkooporders/:id/afdruk"
            element={
              <ProtectedRoute>
                <VerkoopAfdruk soort="bevestiging" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pakbonnen/:id/afdruk"
            element={
              <ProtectedRoute>
                <VerkoopAfdruk soort="pakbon" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/facturen/:id/afdruk"
            element={
              <ProtectedRoute>
                <VerkoopAfdruk soort="factuur" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/voorraad"
            element={
              <ProtectedRoute>
                <Layout>
                  <VoorraadOverzicht />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/productieorders"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProductieordersList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/locaties"
            element={
              <ProtectedRoute>
                <Layout>
                  <LocatiesBeheer />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/gebruikers"
            element={
              <ProtectedRoute adminOnly>
                <Layout>
                  <Gebruikersbeheer />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
