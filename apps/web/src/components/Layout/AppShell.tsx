import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { UserButton, useUser, useAuth } from '@clerk/clerk-react';
import { LayoutDashboard } from 'lucide-react';
import './AppShell.css';

export function AppShell() {
  const { user } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    // Sync user with MongoDB backend
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

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">DocuRAG</div>
        </div>
        
        <nav className="sidebar-nav">
          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <UserButton afterSignOutUrl="/sign-in" />
          <div className="user-info">
            <span className="user-name">{user?.fullName || 'User'}</span>
            <span className="user-email">{user?.primaryEmailAddress?.emailAddress}</span>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
