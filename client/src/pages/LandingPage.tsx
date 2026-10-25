import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, ArrowRight, Activity, MapPin, KeyRound, AlertCircle } from 'lucide-react';
import { api } from '../api';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  // User Sensor Lookup State
  const [sensorCode, setSensorCode] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Admin Login State
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = sensorCode.trim().toUpperCase();
    if (!code) {
      setLookupError('Please enter a sensor code');
      return;
    }

    try {
      setIsLookingUp(true);
      setLookupError('');
      // Test if sensor exists
      await api.getPublicSensorStatus(code);
      // Valid -> go to public user view
      navigate(`/view/${code}`);
    } catch (err: any) {
      setLookupError(err.message || `Sensor '${code}' not found. Try code: ROOM-101`);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser.trim() || !adminPass.trim()) {
      setLoginError('Enter both username and password');
      return;
    }

    try {
      setIsLoggingIn(true);
      setLoginError('');
      const res = await api.adminLogin({ username: adminUser.trim(), password: adminPass });
      if (res.data?.authenticated) {
        localStorage.setItem('crowd_admin_auth', 'true');
        navigate('/admin');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Invalid credentials. Default: admin / admin123');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">CrowdMonitor</h1>
            <p className="text-xs text-slate-400">Smart Occupancy Intelligence Platform</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          IoT Sensor Telemetry Active
        </div>
      </header>

      {/* Main Split Sections */}
      <main className="max-w-6xl mx-auto w-full my-auto py-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Real-Time Occupancy & Crowd Flow
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            Choose your portal below. Public visitors can check room availability via sensor code. Facility managers access the full analytics dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* SECTION 1: PUBLIC USER PORTAL */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
            
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider mb-4">
                <Eye className="w-3.5 h-3.5" />
                Public Visitor Access
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Check Room Occupancy</h3>
              <p className="text-slate-400 text-sm mb-6">
                Enter your facility or room sensor code to view real-time headcount, capacity, and current safety status.
              </p>

              <form onSubmit={handleLookup} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Sensor / Room Code
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={sensorCode}
                      onChange={(e) => setSensorCode(e.target.value.toUpperCase())}
                      placeholder="e.g. ROOM-101"
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-base tracking-wider"
                    />
                    <span className="absolute right-3.5 top-3.5 text-xs text-slate-500 font-mono">
                      CODE
                    </span>
                  </div>
                  {lookupError && (
                    <div className="mt-2 text-xs text-rose-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{lookupError}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLookingUp}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  {isLookingUp ? 'Verifying Code...' : 'View Crowd Status'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                Demo Prototype: <code className="text-blue-300 font-mono ml-1">ROOM-101</code>
              </span>
              <button
                type="button"
                onClick={() => setSensorCode('ROOM-101')}
                className="text-blue-400 hover:underline"
              >
                Auto-fill
              </button>
            </div>
          </div>

          {/* SECTION 2: ADMIN MANAGEMENT PORTAL */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-semibold uppercase tracking-wider mb-4">
                <Shield className="w-3.5 h-3.5" />
                Operator & Admin Portal
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Facility Management</h3>
              <p className="text-slate-400 text-sm mb-6">
                Full analytics, real-time remote capacity controller, event sessions, incident logs, and CSV reports.
              </p>

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Admin Username
                  </label>
                  <input
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                  {loginError && (
                    <div className="mt-2 text-xs text-rose-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  {isLoggingIn ? 'Authenticating...' : 'Sign In to Dashboard'}
                </button>
              </form>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
              <span>Prototype default credentials:</span>
              <span className="font-mono text-slate-300">admin / admin123</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto w-full py-4 text-center text-xs text-slate-500 border-t border-slate-800">
        CrowdMonitor IoT • Connected via HiveMQ Cloud • ESP8266 Live Node
      </footer>
    </div>
  );
};
