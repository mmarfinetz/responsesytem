import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

// Import pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboard from './pages/AdminDashboard';
import TechnicianMobile from './pages/TechnicianMobile';
import DispatcherDashboard from './pages/DispatcherDashboard';
import CustomerPortal from './pages/CustomerPortal';
import AIManagement from './pages/AIManagement';
import SystemMonitoring from './pages/SystemMonitoring';
import CustomersPage from './pages/CustomersPage';
import ConversationsPage from './pages/ConversationsPage';
import JobsPage from './pages/JobsPage';
import QuotesPage from './pages/QuotesPage';

// Import components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-background">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Protected routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/technician" element={<TechnicianMobile />} />
              <Route path="/dispatcher" element={<DispatcherDashboard />} />
              <Route path="/customer-portal" element={<CustomerPortal />} />
              <Route path="/ai-management" element={<AIManagement />} />
              <Route path="/system-monitoring" element={<SystemMonitoring />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/quotes" element={<QuotesPage />} />
            </Route>

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'hsl(var(--card))',
                color: 'hsl(var(--card-foreground))',
                border: '1px solid hsl(var(--border))',
              },
            }}
          />
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;