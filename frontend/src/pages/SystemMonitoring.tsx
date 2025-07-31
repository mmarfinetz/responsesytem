import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Activity,
  Server,
  Database,
  Shield,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  HardDrive,
  Network,
  Zap,
  Cloud,
  Monitor,
  Lock,
  Users,
  Globe,
  Gauge,
  BarChart3,
  Settings,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { StatusIndicator, SystemHealth } from '@/components/ui/StatusIndicator';
import { MetricCard } from '@/components/ui/MetricCard';
import { RealTimeChart } from '@/components/ui/RealTimeChart';

interface SystemMetrics {
  infrastructure: {
    uptime: number; // in hours
    totalRequests: number;
    errorRate: number;
    avgResponseTime: number;
    activeConnections: number;
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkIO: { in: number; out: number };
  };
  security: {
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    blockedAttacks: number;
    suspiciousActivities: number;
    lastSecurityScan: Date;
    vulnerabilities: { critical: number; high: number; medium: number; low: number };
  };
  costs: {
    totalMonthlyCost: number;
    costBreakdown: Array<{
      service: string;
      cost: number;
      percentage: number;
    }>;
    costTrend: { value: number; change: number };
    budgetUsage: number; // percentage
  };
  capacity: {
    currentLoad: number; // percentage
    predictedPeakTime: Date;
    scalingRecommendations: string[];
    resourceUtilization: Array<{
      resource: string;
      current: number;
      capacity: number;
      trend: 'increasing' | 'stable' | 'decreasing';
    }>;
  };
}

interface ServiceStatus {
  name: string;
  status: 'online' | 'warning' | 'error' | 'maintenance';
  uptime: string;
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  dependencies: string[];
  version: string;
  healthChecks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
  }>;
}

interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: 'authentication' | 'authorization' | 'intrusion' | 'data_access' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  description: string;
  action: string;
  resolved: boolean;
}

interface Alert {
  id: string;
  type: 'performance' | 'security' | 'capacity' | 'cost';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  actions: string[];
}

const SystemMonitoring: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'infrastructure' | 'security' | 'costs' | 'capacity' | 'alerts'>('overview');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  // Fetch system metrics
  const { data: systemMetrics, isLoading: metricsLoading } = useQuery<SystemMetrics>(
    ['system-metrics', timeRange],
    () => apiClient.monitoring.getSystemMetrics({ timeRange }),
    {
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Fetch service statuses
  const { data: serviceStatuses } = useQuery<ServiceStatus[]>(
    'service-statuses',
    () => apiClient.monitoring.getServiceStatuses(),
    {
      refetchInterval: 15000, // Refresh every 15 seconds
    }
  );

  // Fetch security events
  const { data: securityEvents } = useQuery<SecurityEvent[]>(
    ['security-events', timeRange],
    () => apiClient.monitoring.getSecurityEvents({ timeRange }),
    {
      refetchInterval: 60000, // Refresh every minute
    }
  );

  // Fetch alerts
  const { data: alerts } = useQuery<Alert[]>(
    'system-alerts',
    () => apiClient.monitoring.getAlerts(),
    {
      refetchInterval: 30000,
    }
  );

  // Fetch performance charts
  const { data: performanceData } = useQuery(
    ['performance-chart', timeRange],
    () => apiClient.monitoring.getPerformanceChart({ timeRange }),
    {
      refetchInterval: 60000,
    }
  );

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Monitor },
    { key: 'infrastructure', label: 'Infrastructure', icon: Server },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'costs', label: 'Costs', icon: DollarSign },
    { key: 'capacity', label: 'Capacity', icon: Gauge },
    { key: 'alerts', label: 'Alerts', icon: AlertTriangle },
  ];

  const severityColors = {
    low: 'text-blue-600 bg-blue-50',
    medium: 'text-yellow-600 bg-yellow-50',
    high: 'text-orange-600 bg-orange-50',
    critical: 'text-red-600 bg-red-50',
  };

  const statusMapping = {
    online: 'online' as const,
    warning: 'warning' as const,
    error: 'error' as const,
    maintenance: 'pending' as const,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Activity className="h-8 w-8 mr-3 text-green-600" />
                System Monitoring
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Infrastructure health, performance metrics, and system oversight
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* System Status Indicator */}
              {systemMetrics && (
                <div className="flex items-center space-x-2">
                  <StatusIndicator 
                    status={systemMetrics.infrastructure.errorRate < 0.01 ? 'online' : 'warning'} 
                    label="System Status"
                  />
                  <span className="text-sm text-gray-600">
                    {systemMetrics.infrastructure.uptime.toFixed(1)}h uptime
                  </span>
                </div>
              )}
              
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
              
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && systemMetrics && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <MetricCard
                title="System Uptime"
                value={`${systemMetrics.infrastructure.uptime.toFixed(1)}h`}
                icon={Clock}
                color="green"
                loading={metricsLoading}
              />
              <MetricCard
                title="Error Rate"
                value={`${(systemMetrics.infrastructure.errorRate * 100).toFixed(2)}%`}
                icon={AlertTriangle}
                color={systemMetrics.infrastructure.errorRate > 0.01 ? 'red' : 'green'}
                loading={metricsLoading}
              />
              <MetricCard
                title="Response Time"
                value={`${systemMetrics.infrastructure.avgResponseTime.toFixed(0)}ms`}
                icon={Zap}
                color="blue"
                loading={metricsLoading}
              />
              <MetricCard
                title="Active Connections"
                value={systemMetrics.infrastructure.activeConnections}
                icon={Users}
                color="purple"
                loading={metricsLoading}
              />
              <MetricCard
                title="Monthly Cost"
                value={`$${systemMetrics.costs.totalMonthlyCost.toLocaleString()}`}
                change={systemMetrics.costs.costTrend}
                icon={DollarSign}
                color="yellow"
                loading={metricsLoading}
              />
            </div>

            {/* System Health Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Service Status */}
              <SystemHealth
                services={serviceStatuses?.map(service => ({
                  name: service.name,
                  status: statusMapping[service.status],
                  uptime: service.uptime,
                  lastCheck: service.lastCheck,
                })) || []}
              />

              {/* Resource Usage */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Resource Usage</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Cpu className="h-5 w-5 text-blue-500 mr-2" />
                      <span className="text-sm font-medium text-gray-900">CPU Usage</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            systemMetrics.infrastructure.cpuUsage > 80 ? 'bg-red-500' :
                            systemMetrics.infrastructure.cpuUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${systemMetrics.infrastructure.cpuUsage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {systemMetrics.infrastructure.cpuUsage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <HardDrive className="h-5 w-5 text-green-500 mr-2" />
                      <span className="text-sm font-medium text-gray-900">Memory Usage</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            systemMetrics.infrastructure.memoryUsage > 80 ? 'bg-red-500' :
                            systemMetrics.infrastructure.memoryUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${systemMetrics.infrastructure.memoryUsage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {systemMetrics.infrastructure.memoryUsage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Database className="h-5 w-5 text-purple-500 mr-2" />
                      <span className="text-sm font-medium text-gray-900">Disk Usage</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            systemMetrics.infrastructure.diskUsage > 80 ? 'bg-red-500' :
                            systemMetrics.infrastructure.diskUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${systemMetrics.infrastructure.diskUsage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {systemMetrics.infrastructure.diskUsage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RealTimeChart
                title="Response Time Trends"
                data={performanceData?.responseTime || []}
                type="line"
                color="#3B82F6"
                formatValue={(value) => `${value.toFixed(0)}ms`}
                loading={!performanceData?.responseTime}
              />

              <RealTimeChart
                title="Error Rate Over Time"
                data={performanceData?.errorRate || []}
                type="area"
                color="#EF4444"
                formatValue={(value) => `${(value * 100).toFixed(2)}%`}
                loading={!performanceData?.errorRate}
              />
            </div>

            {/* Security Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-blue-600" />
                  Security Status
                </h3>
                <StatusIndicator 
                  status={systemMetrics.security.threatLevel === 'low' ? 'online' : 'warning'} 
                  label={`Threat Level: ${systemMetrics.security.threatLevel}`}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {systemMetrics.security.blockedAttacks}
                  </div>
                  <div className="text-sm text-gray-600">Blocked Attacks</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {systemMetrics.security.suspiciousActivities}
                  </div>
                  <div className="text-sm text-gray-600">Suspicious Activities</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {systemMetrics.security.vulnerabilities.critical + systemMetrics.security.vulnerabilities.high}
                  </div>
                  <div className="text-sm text-gray-600">Critical/High Vulnerabilities</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm font-bold text-blue-600">
                    {new Date(systemMetrics.security.lastSecurityScan).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-gray-600">Last Security Scan</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && alerts && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">System Alerts</h2>
              <div className="flex space-x-2">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Acknowledge All
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  Configure Alerts
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <MetricCard
                title="Critical Alerts"
                value={alerts.filter(a => a.severity === 'critical' && !a.resolvedAt).length}
                icon={AlertTriangle}
                color="red"
                size="sm"
              />
              <MetricCard
                title="High Priority"
                value={alerts.filter(a => a.severity === 'high' && !a.resolvedAt).length}
                icon={AlertTriangle}
                color="orange"
                size="sm"
              />
              <MetricCard
                title="Acknowledged"
                value={alerts.filter(a => a.acknowledged && !a.resolvedAt).length}
                icon={CheckCircle}
                color="blue"
                size="sm"
              />
              <MetricCard
                title="Resolved Today"
                value={alerts.filter(a => a.resolvedAt && new Date(a.resolvedAt).toDateString() === new Date().toDateString()).length}
                icon={CheckCircle}
                color="green"
                size="sm"
              />
            </div>

            <div className="bg-white rounded-lg shadow">
              <div className="divide-y divide-gray-100">
                {alerts.filter(a => !a.resolvedAt).map((alert) => (
                  <div key={alert.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle className={`h-5 w-5 mt-1 ${
                          alert.severity === 'critical' ? 'text-red-500' :
                          alert.severity === 'high' ? 'text-orange-500' :
                          alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                        }`} />
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{alert.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span className={`px-2 py-1 rounded font-medium ${severityColors[alert.severity]}`}>
                              {alert.severity.toUpperCase()}
                            </span>
                            <span>{alert.type}</span>
                            <span>{new Date(alert.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        {!alert.acknowledged && (
                          <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                            Acknowledge
                          </button>
                        )}
                        <button className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50">
                          View Details
                        </button>
                      </div>
                    </div>
                    
                    {alert.actions.length > 0 && (
                      <div className="mt-4 pl-8">
                        <p className="text-sm font-medium text-gray-700 mb-2">Recommended Actions:</p>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {alert.actions.map((action, index) => (
                            <li key={index} className="flex items-start">
                              <span className="mr-2">•</span>
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Other tabs would be implemented similarly */}
      </div>
    </div>
  );
};

export default SystemMonitoring;