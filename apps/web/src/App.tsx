import { Routes, Route, Navigate } from 'react-router-dom'
import { SignIn, SignUp, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'

function Dashboard() {
  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>DocuRAG Dashboard</h1>
        <UserButton />
      </header>
      <p>Welcome to your document workspace.</p>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" />
        </div>
      } />
      <Route path="/sign-up/*" element={
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/dashboard" />
        </div>
      } />
      
      <Route path="/dashboard" element={
        <>
          <SignedIn>
            <Dashboard />
          </SignedIn>
          <SignedOut>
            <Navigate to="/sign-in" />
          </SignedOut>
        </>
      } />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
