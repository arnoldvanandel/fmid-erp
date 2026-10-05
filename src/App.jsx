import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ArtikelenList from './pages/artikelen/ArtikelenList'
import LeveranciersList from './pages/leveranciers/LeveranciersList'
import InkoopordersList from './pages/inkooporders/InkoopordersList'
import InkooporderAfdruk from './pages/inkooporders/InkooporderAfdruk'
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
