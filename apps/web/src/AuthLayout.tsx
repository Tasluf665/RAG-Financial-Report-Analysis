import React from 'react';
import './AuthLayout.css';
import heroImage from './assets/LoginPageIcon.svg';

export const AuthLayout = ({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle: string }) => {
  return (
    <div className="auth-container">
      {/* Left Pane */}
      <div className="auth-left">
        <div className="auth-left-content">
          <div className="auth-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="24" height="24" rx="4" fill="#0052FF" />
              <path d="M7 12H17M12 7V17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>DocuRAG</span>
          </div>

          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>

          <div className="auth-illustration">
            <img src={heroImage} alt="Illustration" />
          </div>

          <div className="auth-footer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>Your documents stay private and searchable only within your workspace.</span>
          </div>
        </div>
      </div>

      {/* Right Pane */}
      <div className="auth-right">
        {children}
      </div>
    </div>
  );
};
