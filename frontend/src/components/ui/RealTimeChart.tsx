import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/utils/cn';

export interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
  [key: string]: any;
}

interface RealTimeChartProps {
  data: ChartDataPoint[];
  title?: string;
  type?: 'line' | 'area' | 'bar';
  height?: number;
  color?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  loading?: boolean;
  className?: string;
  formatValue?: (value: number) => string;
  formatTimestamp?: (timestamp: string) => string;
  multiLine?: {
    key: string;
    name: string;
    color: string;
  }[];
}

const LoadingSkeleton: React.FC<{ height: number }> = ({ height }) => (
  <div className="animate-pulse">
    <div className="h-6 bg-gray-300 rounded w-40 mb-4"></div>
    <div className={`bg-gray-300 rounded`} style={{ height }}></div>
  </div>
);

export const RealTimeChart: React.FC<RealTimeChartProps> = ({
  data,
  title,
  type = 'line',
  height = 300,
  color = '#3B82F6',
  showGrid = true,
  showLegend = false,
  loading = false,
  className,
  formatValue = (value) => value.toString(),
  formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },
  multiLine,
}) => {
  if (loading) {
    return (
      <div className={cn('bg-white p-6 rounded-lg shadow', className)}>
        <LoadingSkeleton height={height} />
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="text-sm text-gray-600 mb-1">
            {formatTimestamp(label)}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name || 'Value'}: {formatValue(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const commonProps = {
      data,
      height,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    };

    const xAxisProps = {
      dataKey: 'timestamp',
      tickFormatter: formatTimestamp,
      fontSize: 12,
      axisLine: false,
      tickLine: false,
    };

    const yAxisProps = {
      tickFormatter: formatValue,
      fontSize: 12,
      axisLine: false,
      tickLine: false,
    };

    switch (type) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {multiLine ? (
              multiLine.map((line) => (
                <Area
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  fill={line.color}
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              ))
            ) : (
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.3}
                strokeWidth={2}
              />
            )}
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {multiLine ? (
              multiLine.map((line) => (
                <Bar
                  key={line.key}
                  dataKey={line.key}
                  name={line.name}
                  fill={line.color}
                />
              ))
            ) : (
              <Bar dataKey="value" fill={color} />
            )}
          </BarChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {multiLine ? (
              multiLine.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        );
    }
  };

  return (
    <div className={cn('bg-white p-6 rounded-lg shadow', className)}>
      {title && (
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

export default RealTimeChart;