import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, MessageSquare, UploadCloud, Menu } from 'lucide-react';
import { UserButton, useUser, useAuth } from '@clerk/clerk-react';
import { DocumentDropzone } from '../Upload/DocumentDropzone';
import './AppLayout.css';

export function AppLayout() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 1024);

  React.useEffect(() => {
    const handleViewportChange = () => {
      setIsSidebarOpen(window.innerWidth > 1024);
    };

    window.addEventListener('resize', handleViewportChange);
    return () => window.removeEventListener('resize', handleViewportChange);
  }, []);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  React.useEffect(() => {
    const syncUser = async () => {
      try {
        const token = await getToken();
        if (token) {
          await fetch('/api/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      } catch (error) {
        console.error('Failed to sync user profile:', error);
      }
    };
    syncUser();
  }, [getToken]);

  const getPageTitle = () => {
    if (location.pathname === '/documents') return 'Documents';
    if (location.pathname.startsWith('/documents')) return 'Documents';
    if (location.pathname.startsWith('/chat')) return 'Chat';
    if (location.pathname.startsWith('/settings')) return 'Settings';
    return 'Dashboard';
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`app-sidebar ${!isSidebarOpen ? 'collapsed' : 'is-open'}`}>
        <div className="sidebar-header">
          <h1 className="logo-title">DocuRAG</h1>
          <span className="logo-subtitle">EXPERT INTELLIGENCE</span>
        </div>

        <div className="sidebar-upload">
          <button className="btn-upload" onClick={() => setIsUploadOpen(true)}>
            <UploadCloud size={16} />
            <span>Upload Document</span>
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" className={({ isActive }) => (isActive && location.pathname === '/' ? 'nav-link active' : 'nav-link')}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <FileText size={18} />
            <span>Documents</span>
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <MessageSquare size={18} />
            <span>Chat</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-link">
            <UserButton afterSignOutUrl="/sign-in" />
            <div className="user-profile-info">
              <span className="user-name">{user?.firstName || 'User'} {user?.lastName || ''}</span>
              <span className="user-email">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
        </div>
      </aside>

      {isSidebarOpen && (
        <button
          type="button"
          className="sidebar-drawer-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="app-main">
        {/* Top Bar */}
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: '#434655' }}
            >
              <Menu size={20} />
            </button>
            <h2 className="topbar-title">{getPageTitle()}</h2>
          </div>
          <div className="topbar-actions">
            {/* Future search/notifications can go here */}
          </div>
        </header>

        {/* Page Content */}
        <main className="app-content">
          <Outlet />
        </main>
      </div>

      {isUploadOpen && (
        <div className="sidebar-upload-overlay" onClick={() => setIsUploadOpen(false)}>
          <div className="sidebar-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="sidebar-upload-title" onClick={event => event.stopPropagation()}>
            <div className="sidebar-upload-dialog-header">
              <h2 id="sidebar-upload-title">Upload documents</h2>
              <button type="button" className="sidebar-upload-close" title="Close upload dialog" aria-label="Close upload dialog" onClick={() => setIsUploadOpen(false)}>
                ×
              </button>
            </div>
            <DocumentDropzone
              inputId="sidebar-file-upload"
              onUploadComplete={() => {
                setIsUploadOpen(false);
                navigate('/dashboard');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
