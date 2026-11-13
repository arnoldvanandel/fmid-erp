import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ArtikelenList from './pages/artikelen/ArtikelenList'
import GereedschappenOverzicht from './pages/gereedschappen/GereedschappenOverzicht'
import Labels from './pages/labels/Labels'
import LeveranciersList from './pages/leveranciers/LeveranciersList'
import KlantenList from './pages/klanten/KlantenList'
import PostnlLabels from './pages/postnl/PostnlLabels'
import InkoopordersList from './pages/inkooporders/InkoopordersList'
import OpenstaandeInkooporders from './pages/inkooporders/OpenstaandeInkooporders'
import InkooporderAfdruk from './pages/inkooporders/InkooporderAfdruk'
import OntvangstMobiel from './pages/inkooporders/OntvangstMobiel'
import OntvangstrapportenList from './pages/inkooporders/OntvangstrapportenList'
import OntvangstrapportAfdruk from './pages/inkooporders/OntvangstrapportAfdruk'
import InkoopsjablonenList from './pages/inkooporders/InkoopsjablonenList'
import VerkoopordersList from './pages/verkooporders/VerkoopordersList'
import OpenstaandeOrders from './pages/verkooporders/OpenstaandeOrders'
import FacturenList from './pages/verkooporders/FacturenList'
import VerkoopAfdruk from './pages/verkooporders/VerkoopAfdruk'
import PicklijstAfdruk from './pages/verkooporders/PicklijstAfdruk'
import PicklijstenList from './pages/picklijsten/PicklijstenList'
import KlantPicklijstAfdruk from './pages/picklijsten/KlantPicklijstAfdruk'
import PicklijstMobiel from './pages/picklijsten/PicklijstMobiel'
import PickrapportAfdruk from './pages/picklijsten/PickrapportAfdruk'
import PickrapportenList from './pages/picklijsten/PickrapportenList'
import InpakMobiel from './pages/picklijsten/InpakMobiel'
import InpaklijstAfdruk from './pages/picklijsten/InpaklijstAfdruk'
import InpakrapportAfdruk from './pages/picklijsten/InpakrapportAfdruk'
import VoorraadOverzicht from './pages/voorraad/VoorraadOverzicht'
import OpVoorraadMobiel from './pages/voorraad/OpVoorraadMobiel'
import OpVoorraadRapport from './pages/voorraad/OpVoorraadRapport'
import MutatiesOverzicht from './pages/voorraad/MutatiesOverzicht'
import ProductieordersList from './pages/productieorders/ProductieordersList'
import LocatiesBeheer from './pages/locaties/LocatiesBeheer'
import LooprouteBeheer from './pages/locaties/LooprouteBeheer'
import Gebruikersbeheer from './pages/gebruikers/Gebruikersbeheer'

function terugNaLogin(from) {
  const pad = `${from?.pathname || ''}${from?.search || ''}${from?.hash || ''}`
  if (!pad.startsWith('/') || pad.startsWith('//')) return '/'
  return pad
}

function LoginRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }
  if (user) return <Navigate to={terugNaLogin(location.state?.from)} replace />
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
            path="/gereedschappen"
            element={
              <ProtectedRoute>
                <Layout>
                  <GereedschappenOverzicht />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/labels"
            element={
              <ProtectedRoute>
                <Layout>
                  <Labels />
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
            path="/postnl"
            element={
              <ProtectedRoute>
                <Layout>
                  <PostnlLabels />
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
            path="/inkooporders/ontvangst"
            element={
              <ProtectedRoute>
                <OntvangstMobiel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inkooporders/ontvangst/rapporten"
            element={
              <ProtectedRoute>
                <Layout>
                  <OntvangstrapportenList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inkooporders/ontvangst/rapport/:id"
            element={
              <ProtectedRoute>
                <OntvangstrapportAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inkooporders/openstaand"
            element={
              <ProtectedRoute>
                <Layout>
                  <OpenstaandeInkooporders />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inkoopsjablonen"
            element={
              <ProtectedRoute>
                <Layout>
                  <InkoopsjablonenList />
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
            path="/verkooporders/openstaand"
            element={
              <ProtectedRoute>
                <Layout>
                  <OpenstaandeOrders />
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
            path="/verkooporders/:id/picklijst"
            element={
              <ProtectedRoute>
                <PicklijstAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten"
            element={
              <ProtectedRoute>
                <Layout>
                  <PicklijstenList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/rapporten"
            element={
              <ProtectedRoute>
                <Layout>
                  <PickrapportenList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/rapport/:rapportId"
            element={
              <ProtectedRoute>
                <PickrapportAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/:klantId/mobiel"
            element={
              <ProtectedRoute>
                <PicklijstMobiel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/:klantId/rapport"
            element={
              <ProtectedRoute>
                <PickrapportAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/:klantId/inpakken"
            element={
              <ProtectedRoute>
                <InpakMobiel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/:klantId/inpaklijst"
            element={
              <ProtectedRoute>
                <InpaklijstAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/:klantId/inpakrapport"
            element={
              <ProtectedRoute>
                <InpakrapportAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picklijsten/:klantId"
            element={
              <ProtectedRoute>
                <KlantPicklijstAfdruk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/looproute"
            element={
              <ProtectedRoute>
                <Layout>
                  <LooprouteBeheer />
                </Layout>
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
            path="/voorraad/op-voorraad"
            element={
              <ProtectedRoute>
                <OpVoorraadMobiel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/voorraad/op-voorraad/rapport"
            element={
              <ProtectedRoute>
                <OpVoorraadRapport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/voorraad/mutaties"
            element={
              <ProtectedRoute>
                <Layout>
                  <MutatiesOverzicht />
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
