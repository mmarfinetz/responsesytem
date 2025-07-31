import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

// Types
interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth token management
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  } else {
    delete api.defaults.headers.common['Authorization'];
    localStorage.removeItem('auth_token');
  }
};

// Initialize auth token from localStorage
const storedToken = localStorage.getItem('auth_token');
if (storedToken) {
  setAuthToken(storedToken);
}

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add API key for certain endpoints
    const apiKey = import.meta.env.VITE_API_KEY || 'dev-api-key-change-this';
    if (config.url?.startsWith('/api/')) {
      config.headers['X-API-Key'] = apiKey;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    const apiError: ApiError = {
      message: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    };

    if (error.response) {
      // Server responded with error status
      const { data, status } = error.response;
      
      if (data?.error) {
        apiError.message = data.error.message || 'Server error';
        apiError.code = data.error.code || `HTTP_${status}`;
        apiError.details = data.error.details;
      } else {
        apiError.message = `HTTP ${status} Error`;
        apiError.code = `HTTP_${status}`;
      }

      // Handle specific status codes
      if (status === 401) {
        // Unauthorized - clear auth token and redirect to login
        setAuthToken(null);
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (status === 429) {
        apiError.message = 'Too many requests. Please try again later.';
      }
    } else if (error.request) {
      // Network error
      apiError.message = 'Network error. Please check your connection.';
      apiError.code = 'NETWORK_ERROR';
    } else {
      // Request setup error
      apiError.message = error.message || 'Request failed';
      apiError.code = 'REQUEST_ERROR';
    }

    // Show toast notification for errors (except 401)
    if (error.response?.status !== 401) {
      toast.error(apiError.message);
    }

    return Promise.reject({ ...error, apiError });
  }
);

// API methods
export const apiClient = {
  // Auth endpoints
  auth: {
    login: (email: string, password: string) =>
      api.post('/api/auth/login', { email, password }),
    
    logout: () =>
      api.post('/api/auth/logout'),
    
    verifyToken: () =>
      api.get('/api/auth/verify'),
    
    refreshToken: () =>
      api.post('/api/auth/refresh'),
  },

  // Customer endpoints
  customers: {
    getAll: (params?: any) =>
      api.get('/api/customers', { params }),
    
    getById: (id: string) =>
      api.get(`/api/customers/${id}`),
    
    getHistory: (id: string) =>
      api.get(`/api/customers/${id}/history`),
    
    getCurrentProfile: () =>
      api.get('/api/customers/profile'),
    
    getServiceHistory: () =>
      api.get('/api/customers/service-history'),
    
    getEquipment: () =>
      api.get('/api/customers/equipment'),
    
    create: (data: any) =>
      api.post('/api/customers', data),
    
    update: (id: string, data: any) =>
      api.put(`/api/customers/${id}`, data),
    
    delete: (id: string) =>
      api.delete(`/api/customers/${id}`),
    
    getConversations: (id: string) =>
      api.get(`/api/customers/${id}/conversations`),
  },

  // Conversation endpoints
  conversations: {
    getAll: (params?: any) =>
      api.get('/api/conversations', { params }),
    
    getById: (id: string) =>
      api.get(`/api/conversations/${id}`),
    
    getMessages: (id: string) =>
      api.get(`/api/conversations/${id}/messages`),
    
    sendMessage: (id: string, data: any) =>
      api.post(`/api/conversations/${id}/messages`, data),
    
    updateStatus: (id: string, data: any) =>
      api.patch(`/api/conversations/${id}/status`, data),
    
    create: (data: any) =>
      api.post('/api/conversations', data),
    
    update: (id: string, data: any) =>
      api.put(`/api/conversations/${id}`, data),
    
    addMessage: (id: string, data: any) =>
      api.post(`/api/conversations/${id}/messages`, data),
    
    markAsRead: (id: string) =>
      api.patch(`/api/conversations/${id}/messages/read`),
  },

  // Job endpoints
  jobs: {
    getAll: (params?: any) =>
      api.get('/api/jobs', { params }),
    
    getById: (id: string) =>
      api.get(`/api/jobs/${id}`),
    
    getActive: () =>
      api.get('/api/jobs/active'),
    
    create: (data: any) =>
      api.post('/api/jobs', data),
    
    update: (id: string, data: any) =>
      api.put(`/api/jobs/${id}`, data),
    
    updateStatus: (id: string, data: any) =>
      api.patch(`/api/jobs/${id}/status`, data),
    
    addNote: (id: string, data: any) =>
      api.post(`/api/jobs/${id}/notes`, data),
    
    uploadPhoto: (id: string, formData: FormData) =>
      api.post(`/api/jobs/${id}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }),
    
    getAvailableTechnicians: (params?: any) =>
      api.get('/api/jobs/available-technicians', { params }),
    
    assignTechnician: (conversationId: string, technicianId: string) =>
      api.post(`/api/jobs/assign`, { conversationId, technicianId }),
    
    delete: (id: string) =>
      api.delete(`/api/jobs/${id}`),
  },

  // Quote endpoints
  quotes: {
    getAll: (params?: any) =>
      api.get('/api/quotes', { params }),
    
    getById: (id: string) =>
      api.get(`/api/quotes/${id}`),
    
    create: (data: any) =>
      api.post('/api/quotes', data),
    
    update: (id: string, data: any) =>
      api.put(`/api/quotes/${id}`, data),
    
    submit: (formData: FormData) =>
      api.post('/api/quotes/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }),
    
    delete: (id: string) =>
      api.delete(`/api/quotes/${id}`),
  },

  // AI endpoints
  ai: {
    generateResponse: (data: any) =>
      api.post('/api/ai/generate-response', data),
    
    getQualityMetrics: () =>
      api.get('/api/ai/quality-metrics'),
    
    getPerformanceMetrics: () =>
      api.get('/api/ai/performance-metrics'),
    
    getJobAssistance: (jobId: string, description: string) =>
      api.post('/api/ai/job-assistance', { jobId, description }),
    
    generateResponseSuggestion: (conversationId: string) =>
      api.post('/api/ai/response-suggestion', { conversationId }),
    
    getResponses: (params?: any) =>
      api.get('/api/ai/responses', { params }),
    
    rateResponse: (responseId: string, data: any) =>
      api.post(`/api/ai/responses/${responseId}/rate`, data),
    
    getPromptTemplates: () =>
      api.get('/api/ai/prompt-templates'),
    
    updatePromptTemplate: (id: string, data: any) =>
      api.put(`/api/ai/prompt-templates/${id}`, data),
    
    getTrainingData: () =>
      api.get('/api/ai/training-data'),
    
    addTrainingData: (data: any) =>
      api.post('/api/ai/training-data', data),
    
    startTraining: () =>
      api.post('/api/ai/training/start'),
  },

  // Analytics endpoints
  analytics: {
    getMetrics: () =>
      api.get('/api/analytics/metrics'),
    
    getAdminMetrics: (params?: any) =>
      api.get('/api/analytics/admin-metrics', { params }),
    
    getRevenueChart: (params?: any) =>
      api.get('/api/analytics/revenue-chart', { params }),
    
    getJobsChart: (params?: any) =>
      api.get('/api/analytics/jobs-chart', { params }),
    
    getAIPerformanceChart: (params?: any) =>
      api.get('/api/analytics/ai-performance-chart', { params }),
    
    getPredictiveInsights: () =>
      api.get('/api/analytics/predictive-insights'),
  },

  // Emergency endpoints
  emergencies: {
    getActiveAlerts: () =>
      api.get('/api/emergencies/active-alerts'),
    
    assignTechnician: (alertId: string, technicianId: string) =>
      api.post(`/api/emergencies/${alertId}/assign`, { technicianId }),
    
    getAlertDetails: (alertId: string) =>
      api.get(`/api/emergencies/${alertId}`),
  },

  // Monitoring endpoints
  monitoring: {
    getSystemHealth: () =>
      api.get('/api/monitoring/system-health'),
    
    getPerformanceMetrics: () =>
      api.get('/api/monitoring/performance'),
    
    getResourceUsage: () =>
      api.get('/api/monitoring/resources'),
    
    getSystemMetrics: (params?: any) =>
      api.get('/api/monitoring/system-metrics', { params }),
    
    getServiceStatuses: () =>
      api.get('/api/monitoring/service-statuses'),
    
    getSecurityEvents: (params?: any) =>
      api.get('/api/monitoring/security-events', { params }),
    
    getAlerts: () =>
      api.get('/api/monitoring/alerts'),
    
    getPerformanceChart: (params?: any) =>
      api.get('/api/monitoring/performance-chart', { params }),
    
    acknowledgeAlert: (alertId: string) =>
      api.post(`/api/monitoring/alerts/${alertId}/acknowledge`),
  },

  // Maintenance endpoints
  maintenance: {
    getRecommendations: () =>
      api.get('/api/maintenance/recommendations'),
    
    scheduleService: (data: any) =>
      api.post('/api/maintenance/schedule', data),
  },

  // Scheduling endpoints
  scheduling: {
    getAvailableSlots: () =>
      api.get('/api/scheduling/available-slots'),
    
    bookAppointment: (data: any) =>
      api.post('/api/scheduling/book', data),
  },

  // Billing endpoints
  billing: {
    getBills: () =>
      api.get('/api/billing/bills'),
    
    payBill: (billId: string, data: any) =>
      api.post(`/api/billing/${billId}/pay`, data),
  },
};

export default api;