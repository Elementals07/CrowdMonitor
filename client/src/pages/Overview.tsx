import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Percent,
  UserMinus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Clock
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  CartesianGrid,
  Legend
} from 'recharts';
import { format } from 'date-fns';
import { api, CurrentOccupancy, OccupancySample, AnalyticsSummary, TimeseriesPoint, Alert } from '../api';
import { socket } from '../socket';
import { Card } from '../components/ui/Card';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { DataLabel } from '../components/ui/DataLabel';
import { StatusDot } from '../components/ui/StatusDot';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';

export const Overview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState<CurrentOccupancy | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [history, setHistory] = useState<OccupancySample[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const oneHourAgo = now - 60 * 60 * 1000;
      const dayAgo = now - 24 * 60 * 60 * 1000;

      const [currentRes, summaryRes, historyRes, timeseriesRes, alertsRes] = await Promise.all([
        api.getCurrentOccupancy(),
        api.getAnalyticsSummary({ from: todayStart.getTime(), to: now }).catch(() => ({
          data: {
            peakOccupancy: 0,
            avgOccupancy: 0,
            totalEntries: 0,
            totalExits: 0,
            overCapacityMinutes: 0,
            sampleCount: 0,
            hasEventTopics: false,
          },
        })),
        api.getOccupancyHistory({ from: oneHourAgo, to: now, limit: 60 }).catch(() => ({ data: [] })),
        api.getAnalyticsTimeseries({ from: dayAgo, to: now, granularity: 'hour' }).catch(() => ({ data: [] })),
        api.getAlerts().catch(() => ({ data: [] })),
      ]);

      setCurrent(currentRes.data);
      setSummary(summaryRes.data);
      // Sort history chronologically
      const sortedHistory = [...(historyRes.data || [])].sort((a, b) => a.ts - b.ts);
      setHistory(sortedHistory);
      setTimeseries(timeseriesRes.data || []);
      setRecentAlerts((alertsRes.data || []).slice(0, 10));
    } catch (err: any) {
      console.error('Failed to load overview data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen to real-time occupancy updates
    const handleOccupancyUpdate = (data: OccupancySample) => {
      setCurrent((prev) => {
        const mqttState = prev?.mqtt ?? {
          connected: true,
          lastMessageAt: data.ts,
          reconnectCount: 0,
          broker: '',
        };
        return {
          sample: data,
          mqtt: { ...mqttState, lastMessageAt: data.ts, connected: true },
          isStale: false,
        };
      });

      // Update rolling history (last 60 items)
      setHistory((prev) => {
        const next = [...prev, data];
        if (next.length > 60) {
          return next.slice(next.length - 60);
        }
        return next;
      });

      // Update today's peak if higher
      setSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          peakOccupancy: Math.max(prev.peakOccupancy, data.occupancy),
        };
      });
    };

    const handleAlertNew = (alert: Alert) => {
      setRecentAlerts((prev) => [alert, ...prev.slice(0, 9)]);
    };

    socket.on('occupancy:update', handleOccupancyUpdate);
    socket.on('alert:new', handleAlertNew);

    return () => {
      socket.off('occupancy:update', handleOccupancyUpdate);
      socket.off('alert:new', handleAlertNew);
    };
  }, []);

  const chartData = useMemo(() => {
    return history.map((item) => ({
      time: format(new Date(item.ts), 'HH:mm:ss'),
      occupancy: item.occupancy,
      capacity: item.capacity,
    }));
  }, [history]);

  const currentSample = current?.sample;
  const currentCapacity = currentSample?.capacity ?? 100;
  const currentOccupancy = currentSample?.occupancy ?? 0;
  const currentPercentage = currentSample?.percentage ?? 0;
  const currentAvailable = currentSample?.available ?? Math.max(0, currentCapacity - currentOccupancy);

  const getStatusVariant = (status?: string): BadgeVariant => {
    switch (status) {
      case 'FULL':
        return 'full';
      case 'OVERLIMIT':
        return 'overlimit';
      default:
        return 'normal';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <PageHeader title="Facility Overview" subtitle="Real-time occupancy and operational KPIs" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
        <div className="h-80 bg-gray-200 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-200 rounded-xl" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Facility Overview" />
        <EmptyState
          icon={<AlertTriangle className="w-10 h-10 text-red-500" />}
          title="Failed to Load Dashboard"
          description={error}
          action={
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Facility Overview"
        subtitle="Real-time occupancy monitoring and operational analytics"
        action={
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        }
      />

      {/* System Status Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <StatusDot connected={!!current?.mqtt?.connected} stale={current?.isStale} />
            <span className="font-medium text-gray-700">
              {current?.mqtt?.connected
                ? current?.isStale
                  ? 'Sensor Feed Stale'
                  : 'Sensor Feed Active'
                : 'Sensor Feed Offline'}
            </span>
          </div>

          <span className="text-gray-300 hidden sm:inline">|</span>

          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {current?.sample?.ts
                ? `Updated ${format(new Date(current.sample.ts), 'HH:mm:ss')}`
                : 'No recent sample'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Status:</span>
            <Badge variant={getStatusVariant(currentSample?.status)} size="sm">
              {currentSample?.status || 'NORMAL'}
            </Badge>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* KPI 1: Current Occupancy */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Current Occupancy</span>
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">{currentOccupancy}</span>
              <span className="text-sm font-medium text-gray-500">/ {currentCapacity} cap</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  currentPercentage > 100
                    ? 'bg-red-600'
                    : currentPercentage >= 90
                    ? 'bg-amber-500'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${Math.min(100, currentPercentage)}%` }}
              />
            </div>
          </div>
        </Card>

        {/* KPI 2: Utilization % */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Capacity Utilization</span>
            <Percent className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">{Math.round(currentPercentage)}%</span>
              <Badge variant={getStatusVariant(currentSample?.status)} size="sm">
                {currentSample?.status || 'NORMAL'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {currentPercentage >= 100
                ? 'Facility is at or over capacity threshold'
                : `${100 - Math.round(currentPercentage)}% headroom remaining`}
            </p>
          </div>
        </Card>

        {/* KPI 3: Available Spaces */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Available Spaces</span>
            <UserMinus className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">{currentAvailable}</span>
              <span className="text-sm font-medium text-gray-500">slots</span>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {currentAvailable === 0
                ? 'No remaining capacity'
                : `Calculated from max capacity (${currentCapacity})`}
            </p>
          </div>
        </Card>

        {/* KPI 4: Entries Today */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider">Entries Today</span>
              <DataLabel type="estimated" />
            </div>
            <ArrowUpRight className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-gray-900">
              {summary?.totalEntries ?? 0}
            </div>
            <p className="text-xs text-gray-500 mt-3">Estimated from positive occupancy increments</p>
          </div>
        </Card>

        {/* KPI 5: Exits Today */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider">Exits Today</span>
              <DataLabel type="estimated" />
            </div>
            <ArrowDownRight className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-gray-900">
              {summary?.totalExits ?? 0}
            </div>
            <p className="text-xs text-gray-500 mt-3">Estimated from negative occupancy increments</p>
          </div>
        </Card>

        {/* KPI 6: Peak Today */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Peak Occupancy Today</span>
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">
                {summary?.peakOccupancy ?? currentOccupancy}
              </span>
              <span className="text-sm font-medium text-gray-500">people</span>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {summary?.overCapacityMinutes
                ? `${summary.overCapacityMinutes} min spent over limit`
                : 'Within safe limits today'}
            </p>
          </div>
        </Card>
      </div>

      {/* Live Occupancy Line Chart (Last 60 Minutes) */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Live Occupancy (Last 60 Minutes)</h2>
            <p className="text-xs text-gray-500">Live stream via WebSocket connection</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-600 inline-block" />
              Occupancy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500 border-dashed inline-block" />
              Capacity Limit ({currentCapacity})
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-gray-400">
            Waiting for live telemetry stream...
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  domain={[0, (dataMax: number) => Math.max(currentCapacity + 5, Math.ceil(dataMax * 1.1))]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-gray-900 text-white text-xs p-2.5 rounded-lg shadow-lg">
                          <p className="font-semibold text-gray-300">{label}</p>
                          <p className="text-blue-400 mt-1 font-medium">
                            Occupancy: {payload[0]?.value}
                          </p>
                          <p className="text-gray-400">Capacity: {currentCapacity}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine
                  y={currentCapacity}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: 'Max Capacity',
                    position: 'top',
                    fill: '#ef4444',
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="occupancy"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Two-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Hourly Entries vs Exits Bar Chart */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">Hourly Flow (24h)</h2>
                <DataLabel type="estimated" />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Entries and exits per hour</p>
            </div>
          </div>

          <div className="flex-1 min-h-[260px]">
            {timeseries.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-sm text-gray-400">
                No hourly timeseries data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={timeseries.map((pt) => ({
                    time: pt.bucket || (pt.ts ? format(new Date(pt.ts), 'HH:mm') : ''),
                    entries: pt.entries || 0,
                    exits: pt.exits || 0,
                  }))}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-gray-900 text-white text-xs p-2.5 rounded-lg shadow-lg">
                            <p className="font-semibold text-gray-300">{label}</p>
                            <p className="text-blue-400 mt-1">Entries: {payload[0]?.value}</p>
                            <p className="text-emerald-400">Exits: {payload[1]?.value}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    iconType="circle"
                  />
                  <Bar dataKey="entries" name="Entries" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="exits" name="Exits" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Right: Recent Events / Alerts */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Recent System Events</h2>
              <p className="text-xs text-gray-500 mt-0.5">Threshold breaches and connection alerts</p>
            </div>
            <span className="text-xs text-gray-400">{recentAlerts.length} events</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[260px] space-y-2.5">
            {recentAlerts.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                No recent alerts or incidents recorded
              </div>
            ) : (
              recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-lg border border-gray-100 bg-gray-50 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`p-1.5 rounded-md mt-0.5 ${
                        alert.type.includes('OVERLIMIT')
                          ? 'bg-red-100 text-red-600'
                          : alert.type.includes('FULL')
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <div className="font-semibold text-gray-900">
                        {alert.type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-gray-500 mt-0.5">
                        Occupancy reached {alert.occupancy} (Capacity {alert.capacity})
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-gray-400 block">
                      {format(new Date(alert.ts_start), 'HH:mm:ss')}
                    </span>
                    <span
                      className={`inline-block mt-1 font-medium ${
                        alert.ts_end ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {alert.ts_end ? 'Resolved' : 'Active'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
