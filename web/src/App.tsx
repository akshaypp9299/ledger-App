import { Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import { useAuth } from './auth/AuthContext'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Flats from './pages/Flats'
import Maintenance from './pages/Maintenance'
import Cashbook from './pages/Cashbook'
import Vendors from './pages/Vendors'
import Tenants from './pages/Tenants'
import Attendance from './pages/Attendance'
import Notices from './pages/Notices'
import Documents from './pages/Documents'
import Emergency from './pages/Emergency'
import { Audit, Exports, Users } from './pages/Admin'
import { Locked, Placeholder } from './pages/Misc'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <Loading label="Signing you in..." />
  if (!user) return <Login />
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="flats" element={<Flats />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="cashbook" element={<Cashbook />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="emergency" element={<Emergency />} />
        <Route path="documents" element={<Documents />} />
        <Route path="notices" element={<Notices />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<Audit />} />
        <Route path="exports" element={<Exports />} />
        <Route path="locked/:id" element={<Locked />} />
        <Route path="*" element={<Placeholder title="Page not found" note="That page does not exist." />} />
      </Route>
    </Routes>
  )
}
