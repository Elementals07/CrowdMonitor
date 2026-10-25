import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, 
  MapPin, 
  ArrowLeft, 
  Clock, 
  ShieldCheck, 
  AlertTriangle, 
  Activity, 
  CheckCircle2, 
  Wifi, 
  WifiOff 
} from 'lucide-react';
import { api, OccupancySample } from '../api';
import { socket } from '../socket';

export const UserView: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensorInfo, setSensorInfo] = useState<{ code: string; name: string; location: string } | null>(null);
  
  // Real-time telemetry state
  const [occupancy, setOccupancy] = useState<number>(0);
  const [capacity, setCapacity] = useState<number>(10);
  const [available, setAvailable] = useState<number>(10);
  const [percentage, setPercentage] = useState<number>(0);
  const [status, setStatus] = useState<'NORMAL' | 'FULL' | 'OVERLIMIT'>('NORMAL');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [mqttConnected, setMqttConnected] = useState<boolean>(true);

  // Initial fetch for sensor metadata and latest status
  useEffect(() => {
    let isMounted = true;
    async function fetchSensor() {
      if (!code) return;
      try {
        setLoading(true);
        setError(null);
        const res = await api.getPublicSensorStatus(code);
        if (isMounted && res.data) {
          const d = res.data;
          setSensorInfo(d.sensor);
          setOccupancy(d.occupancy);
          setCapacity(d.capacity);
          setAvailable(d.available);
          setPercentage(d.percentage);
          setStatus(d.status);
          setLastUpdatedAt(d.lastUpdatedAt);
          setIsStale(d.isStale);
          setMqttConnected(d.mqttConnected);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || `Unable to locate sensor code '${code}'.`);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchSensor();
    return () => {
      isMounted = false;
    };
  }, [code]);

  // Real-time Socket.IO updates from the sensor
  useEffect(() => {
    const handleOccupancyUpdate = (data: OccupancySample) => {
      setOccupancy(data.occupancy);
      setCapacity(data.capacity);
      setAvailable(data.available);
      setPercentage(data.percentage);
      setStatus(data.status);
      setLastUpdatedAt(data.ts);
      setIsStale(false);
    };

    const handleMqttStatus = (data: { connected: boolean }) => {
      setMqttConnected(data.connected);
    };

    socket.on('occupancy:update', handleOccupancyUpdate);
    socket.on('mqtt:status', handleMqttStatus);

    return () => {
      socket.off('occupancy:update', handleOccupancyUpdate);
      socket.off('mqtt:status', handleMqttStatus);
    };
  }, []);

  // Format time since last updated
  const formatTime = (ts: number | null) => {
    if (!ts) return 'Waiting for first signal...';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Status Styling Configuration
  const getStatusBadge = () => {
    switch (status) {
      case 'OVERLIMIT':
        return {
          bg: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
          barColor: 'bg-rose-500',
          title: 'OVER CAPACITY',
          desc: 'Maximum limit exceeded. Please wait outside before entering.',
          icon: <AlertTriangle className="w-5 h-5 text-rose-400" />
        };
      case 'FULL':
        return {
          bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
          barColor: 'bg-amber-500',
          title: 'ROOM IS FULL',
          desc: 'All spaces are occupied. Entry temporarily paused.',
          icon: <AlertTriangle className="w-5 h-5 text-amber-400" />
        };
      case 'NORMAL':
      default:
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
          barColor: 'bg-emerald-500',
          title: 'SPACE AVAILABLE',
          desc: 'Safe capacity level. Entry permitted.',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        };
    }
  };

  const statusConfig = getStatusBadge();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <Activity className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm">Connecting to Sensor {code}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Sensor Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Bar */}
      <div className="max-w-xl mx-auto w-full flex items-center justify-between pb-4 border-b border-slate-800/80">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return Home
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          {mqttConnected ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Wifi className="w-3.5 h-3.5" />
              Live Sensor Stream
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-rose-400 font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              Disconnected
            </span>
          )}
        </div>
      </div>

      {/* Main Single Sensor Display Card */}
      <main className="max-w-xl mx-auto w-full my-auto py-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Room / Sensor Details */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs text-blue-400 uppercase tracking-widest mb-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                SENSOR {sensorInfo?.code || code}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {sensorInfo?.name || 'Main Room'}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>{sensorInfo?.location || 'Room Area'}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Capacity</div>
              <div className="text-xl font-bold font-mono text-slate-300">{capacity} max</div>
            </div>
          </div>

          {/* Large Headcount Number */}
          <div className="bg-slate-950/70 rounded-2xl p-6 border border-slate-800/80 text-center mb-6">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">
              Current Headcount
            </span>
            <div className="flex items-baseline justify-center gap-3">
              <span className="text-6xl sm:text-7xl font-black tracking-tight text-white font-mono">
                {occupancy}
              </span>
              <span className="text-2xl sm:text-3xl font-semibold text-slate-500 font-mono">
                / {capacity}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              People currently inside
            </p>
          </div>

          {/* Condition Status Banner */}
          <div className={`p-4 rounded-2xl border ${statusConfig.bg} flex items-center gap-3.5 mb-6`}>
            {statusConfig.icon}
            <div>
              <div className="text-sm font-bold tracking-wide uppercase">
                {statusConfig.title}
              </div>
              <div className="text-xs opacity-90">
                {statusConfig.desc}
              </div>
            </div>
          </div>

          {/* Progress / Utilization Bar */}
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-400">Occupancy Utilization</span>
              <span className="font-mono text-white">{percentage}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3.5 p-0.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${statusConfig.barColor}`}
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              ></div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 text-center">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">
                Spaces Available
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {available}
              </span>
            </div>

            <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 text-center">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">
                Safety Status
              </span>
              <span className="text-sm font-bold font-mono text-slate-200 mt-1 inline-flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                {status}
              </span>
            </div>
          </div>

          {/* Stale Warning Banner if inactive */}
          {isStale && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Sensors haven't reported in over 60 seconds. Showing last recorded state.</span>
            </div>
          )}

          {/* Footer timestamp */}
          <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Updated: {formatTime(lastUpdatedAt)}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Live Sync
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-xl mx-auto w-full text-center text-xs text-slate-600 pt-4">
        CrowdMonitor Public View • Read-Only Live Stream
      </footer>
    </div>
  );
};
