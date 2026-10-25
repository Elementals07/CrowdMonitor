import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  BarChart3,
  Clock,
  Bell,
  FileText,
  Settings,
  Menu,
  X,
  Activity,
  AlertCircle
} from 'lucide-react';
import { socket } from '../../socket';
import { api, MqttStatus } from '../../api';
import { StatusDot } from '../ui/StatusDot';
import clsx from 'clsx';

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openAlertCount, setOpenAlertCount] = useState<number>(0);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>({
    connected: false,
    lastMessageAt: null,
    reconnectCount: 0,
    broker: '',
  });
  const [isStale, setIsStale] = useState<boolean>(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Initial fetch
  useEffect(() => {
    let isMounted = true;

    async function initData() {
      try {
        const [currentRes, openAlertsRes] = await Promise.all([
          api.getCurrentOccupancy().catch(() => null),
          api.getOpenAlerts().catch(() => null),
        ]);

        if (isMounted) {
          if (currentRes?.data) {
            setMqttStatus(currentRes.data.mqtt);
            setIsStale(currentRes.data.isStale);
          }
          if (openAlertsRes?.data) {
            setOpenAlertCount(openAlertsRes.data.length);
          }
        }
      } catch (err) {
        console.error('Error fetching initial layout data', err);
      }
    }

    initData();

    // Socket listeners
    const handleMqttStatus = (data: MqttStatus) => {
      setMqttStatus(data);
    };

    const handleAlertNew = () => {
      setOpenAlertCount((prev) => prev + 1);
    };

    const handleOccupancyUpdate = (data: any) => {
      if (data?.ts) {
        setMqttStatus((prev) => ({
          ...prev,
          lastMessageAt: data.ts,
          connected: true,
        }));
        setIsStale(false);
      }
    };

    socket.on('mqtt:status', handleMqttStatus);
    socket.on('alert:new', handleAlertNew);
    socket.on('occupancy:update', handleOccupancyUpdate);

    return () => {
      isMounted = false;
      socket.off('mqtt:status', handleMqttStatus);
      socket.off('alert:new', handleAlertNew);
      socket.off('occupancy:update', handleOccupancyUpdate);
    };
  }, []);

  const navItems = [
    { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
    { label: 'Live Monitor', to: '/admin/live', icon: Radio },
    { label: 'Analytics', to: '/admin/analytics', icon: BarChart3 },
    { label: 'Sessions', to: '/admin/sessions', icon: Clock },
    {
      label: 'Alerts',
      to: '/admin/alerts',
      icon: Bell,
      badge: openAlertCount > 0 ? openAlertCount : undefined,
    },
    { label: 'Reports', to: '/admin/reports', icon: FileText },
    { label: 'Settings', to: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between bg-gray-900 text-white px-4 py-3 border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-500" />
          <span className="font-bold text-lg tracking-tight">CrowdMonitor</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 focus:outline-none"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-gray-300 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:h-screen md:sticky md:top-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* App Logo / Header */}
        <div className="p-6 border-b border-gray-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg tracking-tight leading-none">CrowdMonitor</h1>
            <span className="text-xs text-gray-400 font-medium">Smart Occupancy</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end || item.to === '/admin'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-105" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={clsx(
                      'px-2 py-0.5 text-xs font-semibold rounded-full',
                      item.badge > 0
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-700 text-gray-300'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Switch to Public Portal Link */}
        <div className="px-3 pb-2">
          <NavLink
            to="/"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 transition-colors"
          >
            <span>← Public Portal</span>
          </NavLink>
        </div>

        {/* MQTT Status Indicator Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/40">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <StatusDot connected={mqttStatus.connected} stale={isStale} size="sm" />
              <span className="text-xs font-semibold text-gray-200">
                {mqttStatus.connected
                  ? isStale
                    ? 'MQTT Stale'
                    : 'MQTT Online'
                  : 'MQTT Offline'}
              </span>
            </div>
            {isStale && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-400" title="Data has exceeded stale threshold">
                <AlertCircle className="w-3 h-3" />
                Stale
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 truncate">
            {mqttStatus.lastMessageAt
              ? `Last ping: ${new Date(mqttStatus.lastMessageAt).toLocaleTimeString()}`
              : 'No messages received'}
          </p>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
