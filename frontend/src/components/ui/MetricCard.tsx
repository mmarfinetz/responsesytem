import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
  };
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  loading?: boolean;
  onClick?: () => void;
}

const colorClasses = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  indigo: 'bg-indigo-500',
};

const sizeClasses = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

const iconSizeClasses = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const textSizeClasses = {
  sm: {
    title: 'text-sm',
    value: 'text-lg',
  },
  md: {
    title: 'text-sm',
    value: 'text-2xl',
  },
  lg: {
    title: 'text-base',
    value: 'text-3xl',
  },
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  color = 'blue',
  size = 'md',
  className,
  loading = false,
  onClick,
}) => {
  if (loading) {
    return (
      <div className={cn(
        'bg-white overflow-hidden shadow rounded-lg animate-pulse',
        sizeClasses[size],
        className
      )}>
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={cn('p-2 rounded-md bg-gray-300', iconSizeClasses[size])}></div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <div className="h-4 bg-gray-300 rounded w-20 mb-2"></div>
            <div className="h-6 bg-gray-300 rounded w-12"></div>
          </div>
        </div>
      </div>
    );
  }

  const changeColor = change?.type === 'increase' ? 'text-green-600' : 
                    change?.type === 'decrease' ? 'text-red-600' : 'text-gray-600';

  return (
    <div 
      className={cn(
        'bg-white overflow-hidden shadow rounded-lg transition-all duration-200',
        sizeClasses[size],
        onClick && 'cursor-pointer hover:shadow-md hover:scale-[1.02]',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <div className={cn(colorClasses[color], 'p-2 rounded-md')}>
            <Icon className={cn(iconSizeClasses[size], 'text-white')} />
          </div>
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className={cn(
              'font-medium text-gray-500 truncate',
              textSizeClasses[size].title
            )}>
              {title}
            </dt>
            <dd className={cn(
              'font-medium text-gray-900 flex items-baseline',
              textSizeClasses[size].value
            )}>
              {value}
              {change && (
                <span className={cn('ml-2 text-sm font-medium', changeColor)}>
                  {change.type === 'increase' ? '↗' : change.type === 'decrease' ? '↘' : '→'} 
                  {Math.abs(change.value)}%
                </span>
              )}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
};

export default MetricCard;