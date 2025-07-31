import React from 'react';
import { CheckCircle, AlertCircle, XCircle, Clock, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';

export type StatusType = 'online' | 'offline' | 'warning' | 'error' | 'pending' | 'processing';

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  showPulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

const statusConfig = {
  online: {
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: CheckCircle,
    defaultLabel: 'Online',
  },
  offline: {
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    icon: XCircle,
    defaultLabel: 'Offline',
  },
  warning: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: AlertCircle,
    defaultLabel: 'Warning',
  },
  error: {
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: XCircle,
    defaultLabel: 'Error',
  },
  pending: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: Clock,
    defaultLabel: 'Pending',
  },
  processing: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    icon: Zap,
    defaultLabel: 'Processing',
  },
};

const sizes = {
  sm: {
    container: 'text-xs',
    icon: 'h-3 w-3',
    padding: 'px-2 py-1',
    dot: 'h-2 w-2',
  },
  md: {
    container: 'text-sm',
    icon: 'h-4 w-4',
    padding: 'px-3 py-1',
    dot: 'h-3 w-3',
  },
  lg: {
    container: 'text-base',
    icon: 'h-5 w-5',
    padding: 'px-4 py-2',
    dot: 'h-4 w-4',
  },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  showPulse = false,
  size = 'md',
  className,
  onClick,
}) => {
  const config = statusConfig[status];
  const sizeConfig = sizes[size];
  const Icon = config.icon;
  const displayLabel = label || config.defaultLabel;

  return (
    <div
      className={cn(
        'inline-flex items-center space-x-2 rounded-full font-medium transition-all duration-200',
        config.bgColor,
        config.color,
        sizeConfig.container,
        sizeConfig.padding,
        onClick && 'cursor-pointer hover:opacity-80',
        className
      )}
      onClick={onClick}
    >
      <div className="relative">
        <Icon className={sizeConfig.icon} />
        {showPulse && (
          <div
            className={cn(
              'absolute inset-0 rounded-full animate-ping',
              config.color.replace('text-', 'bg-').replace('-600', '-400'),
              sizeConfig.dot
            )}
          />
        )}
      </div>
      {displayLabel && <span>{displayLabel}</span>}
    </div>
  );
};

interface StatusDotProps {
  status: StatusType;
  showPulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  showPulse = false,
  size = 'md',
  className,
}) => {
  const config = statusConfig[status];
  const sizeConfig = sizes[size];

  return (
    <div className={cn('relative inline-flex', className)}>
      <div
        className={cn(
          'rounded-full',
          config.color.replace('text-', 'bg-'),
          sizeConfig.dot
        )}
      />
      {showPulse && (
        <div
          className={cn(
            'absolute inset-0 rounded-full animate-ping',
            config.color.replace('text-', 'bg-').replace('-600', '-400'),
            sizeConfig.dot
          )}
        />
      )}
    </div>
  );
};

interface SystemHealthProps {
  services: Array<{
    name: string;
    status: StatusType;
    uptime?: string;
    lastCheck?: Date;
  }>;
  className?: string;
}

export const SystemHealth: React.FC<SystemHealthProps> = ({
  services,
  className,
}) => {
  const overallStatus: StatusType = services.some(s => s.status === 'error') ? 'error' :
                                   services.some(s => s.status === 'warning') ? 'warning' :
                                   services.every(s => s.status === 'online') ? 'online' : 'pending';

  return (
    <div className={cn('bg-white rounded-lg shadow p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">System Health</h3>
        <StatusIndicator status={overallStatus} />
      </div>
      
      <div className="space-y-3">
        {services.map((service, index) => (
          <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center space-x-3">
              <StatusDot status={service.status} />
              <span className="text-sm font-medium text-gray-900">{service.name}</span>
            </div>
            <div className="text-right">
              {service.uptime && (
                <div className="text-xs text-gray-500">
                  Uptime: {service.uptime}
                </div>
              )}
              {service.lastCheck && (
                <div className="text-xs text-gray-400">
                  Last check: {service.lastCheck.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusIndicator;