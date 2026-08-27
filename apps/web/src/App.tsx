import { Routes, Route, Navigate } from 'react-router-dom'
import { SignIn, SignUp, SignedIn, SignedOut } from '@clerk/clerk-react'
import { AuthLayout } from './AuthLayout'
import { AppLayout } from './components/Layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { ChunkExplorerPage } from './pages/ChunkExplorerPage'
import { ChatPage } from './pages/ChatPage'

const clerkAppearance = {
  elements: {
    formButtonPrimary: {
      backgroundColor: '#0052FF',
      textTransform: 'none',
      boxShadow: 'none',
      '&:hover': {
        backgroundColor: '#0040cc',
      },
    },
    card: {
      boxShadow: 'none',
      width: '100%',
      maxWidth: '400px',
      padding: '5px',

    },
    cardBox: {
      boxShadow: 'none',
    },
    headerTitle: {
      fontSize: '2rem',
      fontWeight: '600',
    },
    headerSubtitle: {
      color: '#475569',
      fontSize: '1rem',
    },
  },
};

function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={
        <AuthLayout
          title="Ask better questions of your documents."
          subtitle="Upload PDFs, explore extracted content, and get grounded answers with transparent citations."
        >
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" appearance={clerkAppearance} />
        </AuthLayout>
      } />
      <Route path="/sign-up/*" element={
        <AuthLayout
          title="Turn your PDFs into an AI-searchable workspace."
          subtitle="Upload and organize multiple PDFs, inspect extracted text and chunks, and get answers with document citations."
        >
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/dashboard" appearance={clerkAppearance} />
        </AuthLayout>
      } />

      <Route element={
        <SignedIn>
          <AppLayout />
        </SignedIn>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/:documentId" element={<ChunkExplorerPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Route>
      
      <Route element={
        <SignedOut>
          <Navigate to="/sign-in" replace />
        </SignedOut>
      }>
        <Route path="/dashboard" element={null} />
        <Route path="/documents/:documentId" element={null} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
