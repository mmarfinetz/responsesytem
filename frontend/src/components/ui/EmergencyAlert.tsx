import React from 'react';
import { AlertTriangle, Phone, MapPin, Clock, User } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EmergencyAlertData {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  customer: {
    name: string;
    phone: string;
    address?: string;
  };
  message: string;
  timestamp: Date;
  estimatedResponseTime: number;
  assignedTechnician?: {
    name: string;
    eta: number;
  };
  keyIndicators: string[];
}

interface EmergencyAlertProps {
  alert: EmergencyAlertData;
  onAssign?: (alertId: string) => void;
  onCall?: (phone: string) => void;
  onViewDetails?: (alertId: string) => void;
  className?: string;
}

const severityColors = {
  critical: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    badge: 'bg-red-100 text-red-800',
    pulse: 'animate-pulse',
  },
  high: {
    bg: 'bg-orange-50 border-orange-200',
    text: 'text-orange-800',
    badge: 'bg-orange-100 text-orange-800',
    pulse: '',
  },
  medium: {
    bg: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    badge: 'bg-yellow-100 text-yellow-800',
    pulse: '',
  },
  low: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    badge: 'bg-blue-100 text-blue-800',
    pulse: '',
  },
};

export const EmergencyAlert: React.FC<EmergencyAlertProps> = ({
  alert,
  onAssign,
  onCall,
  onViewDetails,
  className,
}) => {
  const severityStyle = severityColors[alert.severity];
  const timeAgo = Math.floor((Date.now() - alert.timestamp.getTime()) / 60000);

  return (
    <div className={cn(
      'border rounded-lg p-4 transition-all duration-200',
      severityStyle.bg,
      severityStyle.pulse,
      className
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <AlertTriangle className={cn('h-5 w-5', severityStyle.text)} />
          <span className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide',
            severityStyle.badge
          )}>
            {alert.severity}
          </span>
          <span className="text-sm text-gray-600">
            {alert.type}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {timeAgo}m ago
        </span>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="flex items-center space-x-2">
          <User className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-900">
            {alert.customer.name}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Phone className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-900">
            {alert.customer.phone}
          </span>
        </div>
        {alert.customer.address && (
          <div className="flex items-center space-x-2 md:col-span-2">
            <MapPin className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-900">
              {alert.customer.address}
            </span>
          </div>
        )}
      </div>

      {/* Message */}
      <div className="mb-3">
        <p className="text-sm text-gray-800 line-clamp-2">
          {alert.message}
        </p>
      </div>

      {/* Key Indicators */}
      {alert.keyIndicators.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1">
            {alert.keyIndicators.map((indicator, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800"
              >
                {indicator}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Assignment Info */}
      {alert.assignedTechnician ? (
        <div className="flex items-center space-x-2 mb-3 p-2 bg-green-50 rounded">
          <Clock className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-800">
            Assigned to {alert.assignedTechnician.name} - ETA: {alert.assignedTechnician.eta}m
          </span>
        </div>
      ) : (
        <div className="flex items-center space-x-2 mb-3 p-2 bg-gray-50 rounded">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600">
            Estimated response time: {alert.estimatedResponseTime}m
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-2">
        {!alert.assignedTechnician && onAssign && (
          <button
            onClick={() => onAssign(alert.id)}
            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors duration-200"
          >
            Assign Technician
          </button>
        )}
        
        {onCall && (
          <button
            onClick={() => onCall(alert.customer.phone)}
            className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-200"
          >
            <Phone className="h-4 w-4" />
          </button>
        )}
        
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(alert.id)}
            className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-200"
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
};

export default EmergencyAlert;