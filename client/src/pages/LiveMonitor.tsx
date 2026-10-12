import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Users,
  ShieldCheck,
  UserMinus,
  Percent,
  WifiOff,
  Clock,
  Send,
  AlertTriangle,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid
} from 'recharts';
import { format } from 'date-fns';
import { api, CurrentOccupancy, OccupancySample, MqttStatus } from '../api';
import { socket } from '../socket';
import { Card } from '../components/ui/Card';
import { StatusDot } from '../components/ui/StatusDot';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';

export const LiveMonitor: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CurrentOccupancy | null>(null);
  const [history, setHistory] = useState<OccupancySample[]>([]);
  const historyRef = useRef<OccupancySample[]>([]);

  // Capacity Control State
  const [newCapacity, setNewCapacity] = useState<number | ''>('');
  const [capacityUpdating, setCapacityUpdating] = useState(false);
  const [capacityFeedback, setCapacityFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [waitingDeviceConfirm, setWaitingDeviceConfirm] = useState(false);

  // Time tracker for time-since-last-message
  const [secondsSinceLastMsg, setSecondsSinceLastMsg] = useState<number | null>(null);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        setLoading(true);
        const [currRes, histRes] = await Promise.all([
          api.getCurrentOccupancy(),
          api.getOccupancyHistory({ limit: 60 }),
        ]);

        if (isMounted) {
          setCurrent(currRes.data);
          if (currRes.data.sample?.capacity) {
            setNewCapacity(currRes.data.sample.capacity);
          }
          const sorted = [...(histRes.data || [])].sort((a, b) => a.ts - b.ts);
          historyRef.current = sorted;
          setHistory(sorted);
        }
      } catch (err) {
        console.error('Failed to load initial live monitor data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // Socket listener for real-time occupancy updates
  useEffect(() => {
    const handleOccupancyUpdate = (data: OccupancySample) => {
      setCurrent((prev) => {
        const mqttState: MqttStatus = prev?.mqtt ?? {
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

      // If we were waiting for confirmation of capacity update
      if (waitingDeviceConfirm && data.capacity === Number(newCapacity)) {
        setWaitingDeviceConfirm(false);
        setCapacityFeedback({
          type: 'success',
          message: `Device confirmed capacity set to ${data.capacity}`,
        });
      }

      // Maintain rolling window in ref (max 120 points)
      const next = [...historyRef.current, data];
      if (next.length > 120) {
        historyRef.current = next.slice(next.length - 120);
      } else {
        historyRef.current = next;
      }
      setHistory([...historyRef.current]);
    };

    const handleMqttStatus = (status: MqttStatus) => {
      setCurrent((prev) => (prev ? { ...prev, mqtt: status } : null));
    };

    socket.on('occupancy:update', handleOccupancyUpdate);
    socket.on('mqtt:status', handleMqttStatus);

    return () => {
      socket.off('occupancy:update', handleOccupancyUpdate);
      socket.off('mqtt:status', handleMqttStatus);
    };
  }, [waitingDeviceConfirm, newCapacity]);

  // Tick timer for "seconds since last message"
  useEffect(() => {
    const interval = setInterval(() => {
      const lastMsg = current?.mqtt?.lastMessageAt || current?.sample?.ts;
      if (lastMsg) {
        const secs = Math.max(0, Math.floor((Date.now() - lastMsg) / 1000));
        setSecondsSinceLastMsg(secs);
      } else {
        setSecondsSinceLastMsg(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [current?.mqtt?.lastMessageAt, current?.sample?.ts]);

  const handleUpdateCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCapacity || Number(newCapacity) <= 0) return;

    try {
      setCapacityUpdating(true);
      setCapacityFeedback(null);
      const res = await api.updateCapacity(Number(newCapacity));
      if (res.data?.published) {
        setWaitingDeviceConfirm(true);
        setCapacityFeedback({
          type: 'success',
          message: 'Sent to device — waiting for confirmation from sensor...',
        });
      } else {
        setCapacityFeedback({
          type: 'error',
          message: 'Failed to publish capacity command to MQTT broker',
        });
      }
    } catch (err: any) {
      setCapacityFeedback({
        type: 'error',
        message: err.message || 'Error sending capacity update',
      });
    } finally {
      setCapacityUpdating(false);
    }
  };

  const sample = current?.sample;
  const capacity = sample?.capacity ?? 100;
  const occupancy = sample?.occupancy ?? 0;
  const percentage = sample?.percentage ?? (capacity > 0 ? (occupancy / capacity) * 100 : 0);
  const available = sample?.available ?? Math.max(0, capacity - occupancy);
  const status = sample?.status ?? 'NORMAL';

  const chartData = useMemo(() => {
    return history.map((item) => ({
      time: format(new Date(item.ts), 'HH:mm:ss'),
      occupancy: item.occupancy,
      capacity: item.capacity,
    }));
  }, [history]);

  const getStatusColorBanner = (st: string) => {
    switch (st) {
      case 'OVERLIMIT':
        return 'bg-red-600 text-white';
      case 'FULL':
        return 'bg-amber-500 text-white';
      default:
        return 'bg-green-600 text-white';
    }
  };

  if (loading && !current) {
    return (
      <div className="space-y-6">
        <PageHeader title="Live Occupancy Monitor" subtitle="High-frequency telemetry directly from facility sensors" />
        <div className="flex items-center justify-center h-80 bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="text-center">
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-gray-500">Connecting to telemetry stream...</p>
          </div>
        </div>
      </div>
    );
  }

  const isMqttConnected = !!current?.mqtt?.connected;
  const isDataStale = current?.isStale || (secondsSinceLastMsg !== null && secondsSinceLastMsg > 30);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Live Occupancy Monitor"
        subtitle="Operator real-time console with direct hardware feedback loop"
      />

      {/* Connection Health Row */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <StatusDot connected={isMqttConnected} stale={isDataStale} size="md" />
            <span className="font-semibold text-gray-800">
              {isMqttConnected
                ? isDataStale
                  ? 'Sensor Feed Stale (>30s)'
                  : 'MQTT Hardware Online'
                : 'MQTT Hardware Disconnected'}
            </span>
          </div>

          <span className="text-gray-300 hidden sm:inline">|</span>

          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {sample?.ts
                ? `Last frame: ${format(new Date(sample.ts), 'HH:mm:ss')}`
                : 'No frame yet'}
            </span>
          </div>

          {secondsSinceLastMsg !== null && (
            <span className="text-xs text-gray-400">
              ({secondsSinceLastMsg}s ago)
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div>
            Broker Reconnects:{' '}
            <span className="font-medium text-gray-700">
              {current?.mqtt?.reconnectCount ?? 0}
            </span>
          </div>
          {isDataStale && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[11px]">
              <AlertTriangle className="w-3 h-3" /> STALE
            </span>
          )}
        </div>
      </div>

      {/* Large Status Banner */}
      <div className={`rounded-xl p-4 text-center shadow-sm transition-colors duration-300 ${getStatusColorBanner(status)}`}>
        <div className="text-xs uppercase tracking-widest font-semibold opacity-90 mb-1">
          Current Operating State
        </div>
        <div className="text-3xl sm:text-4xl font-black tracking-tight flex items-center justify-center gap-2">
          {status === 'OVERLIMIT' && <AlertTriangle className="w-8 h-8 animate-bounce" />}
          <span>{status}</span>
        </div>
        <p className="text-xs sm:text-sm mt-1 opacity-90">
          {status === 'OVERLIMIT'
            ? 'Emergency threshold exceeded! Immediate crowd mitigation required.'
            : status === 'FULL'
            ? 'Facility is at maximum allocated capacity.'
            : 'Occupancy is within standard operating parameters.'}
        </p>
      </div>

      {/* Top Row: 4 Large Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Stat 1: Occupancy */}
        <Card className="flex flex-col justify-between border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Occupancy</span>
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div className="mt-2">
            <span className="text-4xl font-extrabold text-gray-900">{occupancy}</span>
            <span className="text-xs text-gray-400 block mt-1">Live head count</span>
          </div>
        </Card>

        {/* Stat 2: Capacity */}
        <Card className="flex flex-col justify-between border-l-4 border-l-gray-400">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Set Capacity</span>
            <ShieldCheck className="w-5 h-5 text-gray-600" />
          </div>
          <div className="mt-2">
            <span className="text-4xl font-extrabold text-gray-900">{capacity}</span>
            <span className="text-xs text-gray-400 block mt-1">Configured limit</span>
          </div>
        </Card>

        {/* Stat 3: Available */}
        <Card className="flex flex-col justify-between border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Available Spaces</span>
            <UserMinus className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-4xl font-extrabold text-gray-900">{available}</span>
            <span className="text-xs text-gray-400 block mt-1">Remaining entry slots</span>
          </div>
        </Card>

        {/* Stat 4: Utilization % */}
        <Card className="flex flex-col justify-between border-l-4 border-l-indigo-600">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Utilization</span>
            <Percent className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="mt-2">
            <span className="text-4xl font-extrabold text-gray-900">{Math.round(percentage)}%</span>
            <span className="text-xs text-gray-400 block mt-1">
              {percentage > 100 ? 'Over capacity' : `${100 - Math.round(percentage)}% headroom`}
            </span>
          </div>
        </Card>
      </div>

      {/* Live History Chart */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">High-Resolution Rolling Timeline</h2>
            <p className="text-xs text-gray-500">Streaming last {history.length} samples (up to 120 data points)</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-600 inline-block" />
              Sensor Headcount
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500 border-dashed inline-block" />
              Threshold ({capacity})
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-gray-400">
            Streaming buffer empty — waiting for incoming telemetry frames...
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 15, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  domain={[0, (dataMax: number) => Math.max(capacity + 5, Math.ceil(dataMax * 1.15))]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const val = Number(payload[0]?.value) || 0;
                      return (
                        <div className="bg-gray-900 text-white text-xs p-2.5 rounded-lg shadow-xl">
                          <p className="font-semibold text-gray-300">{label}</p>
                          <p className="text-blue-400 mt-1 font-medium">Occupancy: {val}</p>
                          <p className="text-gray-400">Capacity Limit: {capacity}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Status: {val >= capacity ? (val > capacity ? 'OVERLIMIT' : 'FULL') : 'NORMAL'}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine
                  y={capacity}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: `Capacity: ${capacity}`,
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
                  dot={{ r: 2, fill: '#2563eb' }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Capacity Control Panel */}
      <Card>
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
          <Sliders className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Device Capacity Control</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Publish a new target capacity to the active hardware sensor via MQTT topic. The microcontroller updates its local threshold and confirms the new limit in subsequent packets.
        </p>

        <form onSubmit={handleUpdateCapacity} className="max-w-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <label htmlFor="capacity-input" className="block text-xs font-semibold text-gray-700 mb-1">
                Target Capacity
              </label>
              <input
                id="capacity-input"
                type="number"
                min="1"
                step="1"
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                disabled={!isMqttConnected || capacityUpdating || waitingDeviceConfirm}
                className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="Enter capacity (e.g. 50)"
                required
              />
            </div>
            <div className="sm:self-end">
              <button
                type="submit"
                disabled={!isMqttConnected || capacityUpdating || waitingDeviceConfirm || !newCapacity}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm"
              >
                {capacityUpdating ? (
                  <>
                    <Spinner size="sm" className="border-white" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Update Capacity</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {!isMqttConnected && (
            <p className="text-xs text-red-500 flex items-center gap-1.5 font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              Controls disabled: MQTT device is offline or not reachable.
            </p>
          )}

          {capacityFeedback && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                capacityFeedback.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {capacityFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              )}
              <span>{capacityFeedback.message}</span>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
};
