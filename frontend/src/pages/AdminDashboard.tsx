import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  DollarSign, 
  Users, 
  Briefcase, 
  MessageSquare, 
  AlertTriangle, 
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  Shield,
  Bot,
  Wrench,
  Calendar,
  Target,
  Activity,
  MapPin,
  Phone
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { MetricCard } from '@/components/ui/MetricCard';
import { EmergencyAlert, EmergencyAlertData } from '@/components/ui/EmergencyAlert';
import { RealTimeChart, ChartDataPoint } from '@/components/ui/RealTimeChart';
import { StatusIndicator, SystemHealth } from '@/components/ui/StatusIndicator';

interface AdminMetrics {
  revenue: {
    total: number;
    monthly: number;
    change: number;
    forecast: number;
  };
  jobs: {
    active: number;
    completed: number;
    scheduled: number;
    completionRate: number;
  };
  customers: {
    total: number;
    active: number;
    satisfaction: number;
    retention: number;
  };
  ai: {
    responseTime: number;
    accuracy: number;
    costPerDay: number;
    tokensUsed: number;
  };
  emergencies: {
    active: number;
    resolved: number;
    averageResponseTime: number;
  };
}

interface PredictiveInsight {
  type: 'maintenance' | 'revenue' | 'capacity' | 'risk';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  timeframe: string;
  recommendation: string;
}

const AdminDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlertData[]>([]);

  // Fetch dashboard metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery<AdminMetrics>(
    ['admin-metrics', timeRange],
    () => apiClient.analytics.getAdminMetrics({ timeRange }),
    {
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Fetch real-time charts data
  const { data: revenueChartData } = useQuery<ChartDataPoint[]>(
    ['revenue-chart', timeRange],
    () => apiClient.analytics.getRevenueChart({ timeRange }),
    {
      refetchInterval: 60000, // Refresh every minute
    }
  );

  const { data: jobsChartData } = useQuery<ChartDataPoint[]>(
    ['jobs-chart', timeRange],
    () => apiClient.analytics.getJobsChart({ timeRange }),
    {
      refetchInterval: 60000,
    }
  );

  const { data: aiPerformanceData } = useQuery<ChartDataPoint[]>(
    ['ai-performance', timeRange],
    () => apiClient.analytics.getAIPerformanceChart({ timeRange }),
    {
      refetchInterval: 30000,
    }
  );

  // Fetch emergency alerts
  const { data: emergencies } = useQuery<EmergencyAlertData[]>(
    'emergency-alerts',
    () => apiClient.emergencies.getActiveAlerts(),
    {
      refetchInterval: 10000, // Refresh every 10 seconds
      onSuccess: (data) => setEmergencyAlerts(data || []),
    }
  );

  // Fetch predictive insights
  const { data: insights } = useQuery<PredictiveInsight[]>(
    'predictive-insights',
    () => apiClient.analytics.getPredictiveInsights(),
    {
      refetchInterval: 300000, // Refresh every 5 minutes
    }
  );

  // Fetch system health
  const { data: systemHealth } = useQuery(
    'system-health',
    () => apiClient.monitoring.getSystemHealth(),
    {
      refetchInterval: 15000, // Refresh every 15 seconds
    }
  );

  const handleAssignTechnician = (alertId: string) => {
    // TODO: Implement technician assignment
    console.log('Assigning technician to alert:', alertId);
  };

  const handleCallCustomer = (phone: string) => {
    // TODO: Implement click-to-call functionality
    window.open(`tel:${phone}`);
  };

  const handleViewAlertDetails = (alertId: string) => {
    // TODO: Implement alert details modal
    console.log('Viewing alert details:', alertId);
  };

  // Calculate performance indicators
  const performanceIndicators = metrics ? [
    {
      label: 'Revenue Growth',
      value: `${metrics.revenue.change > 0 ? '+' : ''}${metrics.revenue.change.toFixed(1)}%`,
      status: metrics.revenue.change > 0 ? 'online' as const : 'warning' as const,
    },
    {
      label: 'Job Completion Rate',
      value: `${(metrics.jobs.completionRate * 100).toFixed(1)}%`,
      status: metrics.jobs.completionRate > 0.9 ? 'online' as const : 'warning' as const,
    },
    {
      label: 'Customer Satisfaction',
      value: `${metrics.customers.satisfaction.toFixed(1)}/5`,
      status: metrics.customers.satisfaction > 4.0 ? 'online' as const : 'warning' as const,
    },
    {
      label: 'AI Response Time',
      value: `${metrics.ai.responseTime.toFixed(0)}ms`,
      status: metrics.ai.responseTime < 500 ? 'online' as const : 'warning' as const,
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Comprehensive business intelligence and system oversight
          </p>
        </div>
        
        {/* Time Range Selector */}
        <div className="flex space-x-2">
          {(['1h', '24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm font-medium rounded ${
                timeRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Emergency Alerts Section */}
      {emergencyAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-red-800 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Active Emergencies ({emergencyAlerts.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {emergencyAlerts.slice(0, 4).map((alert) => (
              <EmergencyAlert
                key={alert.id}
                alert={alert}
                onAssign={handleAssignTechnician}
                onCall={handleCallCustomer}
                onViewDetails={handleViewAlertDetails}
              />
            ))}
          </div>
          {emergencyAlerts.length > 4 && (
            <div className="mt-4 text-center">
              <button className="text-red-600 hover:text-red-800 font-medium">
                View {emergencyAlerts.length - 4} more emergencies →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Monthly Revenue"
          value={metrics ? `$${(metrics.revenue.monthly / 1000).toFixed(1)}k` : '0'}
          change={metrics ? {
            value: Math.abs(metrics.revenue.change),
            type: metrics.revenue.change > 0 ? 'increase' : 'decrease'
          } : undefined}
          icon={DollarSign}
          color="green"
          loading={metricsLoading}
        />
        
        <MetricCard
          title="Active Jobs"
          value={metrics?.jobs.active || 0}
          icon={Briefcase}
          color="blue"
          loading={metricsLoading}
        />
        
        <MetricCard
          title="Active Customers"
          value={metrics?.customers.active || 0}
          icon={Users}
          color="purple"
          loading={metricsLoading}
        />
        
        <MetricCard
          title="Emergency Response"
          value={metrics ? `${metrics.emergencies.averageResponseTime}m` : '0m'}
          icon={AlertTriangle}
          color="red"
          loading={metricsLoading}
        />
      </div>

      {/* Performance Indicators */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {performanceIndicators.map((indicator, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">{indicator.label}</p>
                <p className="text-lg font-semibold text-gray-900">{indicator.value}</p>
              </div>
              <StatusIndicator status={indicator.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Analytics */}
        <RealTimeChart
          title="Revenue Trends"
          data={revenueChartData || []}
          type="area"
          color="#10B981"
          formatValue={(value) => `$${(value / 1000).toFixed(1)}k`}
          loading={!revenueChartData}
        />

        {/* Job Analytics */}
        <RealTimeChart
          title="Jobs Overview"
          data={jobsChartData || []}
          type="line"
          multiLine={[
            { key: 'completed', name: 'Completed', color: '#10B981' },
            { key: 'active', name: 'Active', color: '#3B82F6' },
            { key: 'scheduled', name: 'Scheduled', color: '#F59E0B' },
          ]}
          showLegend
          loading={!jobsChartData}
        />
      </div>

      {/* AI Performance & System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Bot className="h-5 w-5 mr-2 text-blue-600" />
            AI Performance Dashboard
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {metrics?.ai.accuracy.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Accuracy</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                ${metrics?.ai.costPerDay.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">Daily Cost</div>
            </div>
          </div>

          {aiPerformanceData && (
            <RealTimeChart
              data={aiPerformanceData}
              type="line"
              height={200}
              color="#3B82F6"
              formatValue={(value) => `${value.toFixed(0)}ms`}
              showGrid={false}
            />
          )}
        </div>

        {/* System Health */}
        <SystemHealth
          services={systemHealth?.services || [
            { name: 'Database', status: 'online', uptime: '99.8%' },
            { name: 'AI Service', status: 'online', uptime: '99.5%' },
            { name: 'SMS Gateway', status: 'warning', uptime: '95.2%' },
            { name: 'Email Service', status: 'online', uptime: '99.9%' },
          ]}
        />
      </div>

      {/* Predictive Analytics & Insights */}
      {insights && insights.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Target className="h-5 w-5 mr-2 text-purple-600" />
            Predictive Analytics & Insights
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.slice(0, 4).map((insight, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${
                  insight.impact === 'high' ? 'bg-red-50 border-red-400' :
                  insight.impact === 'medium' ? 'bg-yellow-50 border-yellow-400' :
                  'bg-blue-50 border-blue-400'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{insight.title}</h4>
                  <span className={`text-xs px-2 py-1 rounded ${
                    insight.impact === 'high' ? 'bg-red-100 text-red-800' :
                    insight.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {insight.impact}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{insight.description}</p>
                <p className="text-xs text-gray-500 mb-2">Timeframe: {insight.timeframe}</p>
                <p className="text-sm font-medium text-gray-900">
                  💡 {insight.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="flex flex-col items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
            <Calendar className="h-8 w-8 text-blue-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">Schedule Job</span>
          </button>
          <button className="flex flex-col items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
            <Users className="h-8 w-8 text-green-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">Add Customer</span>
          </button>
          <button className="flex flex-col items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
            <Bot className="h-8 w-8 text-purple-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">AI Training</span>
          </button>
          <button className="flex flex-col items-center p-4 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
            <Shield className="h-8 w-8 text-red-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">System Monitor</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;