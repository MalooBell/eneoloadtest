import React, { useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  CpuChipIcon,
  CircleStackIcon,
  ServerIcon,
  WifiIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import MetricCard from '../Common/MetricCard';

const NodeExporterCharts = ({ data, loading }) => {
  const [visibleCharts, setVisibleCharts] = useState({
    overview: true,
    cpu: true,
    memory: true,
    disk: true,
    network: true,
    load: true
  });

  const toggleChart = (chartId) => {
    setVisibleCharts(prev => ({
      ...prev,
      [chartId]: !prev[chartId]
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, index) => (
            <MetricCard key={index} loading={true} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card text-center py-12">
        <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Aucune donnée système disponible
        </h3>
        <p className="text-gray-500">
          Vérifiez que Node Exporter est démarré
        </p>
      </div>
    );
  }

  // Traitement des données
  const processMetricData = (metricData) => {
    if (!metricData || !metricData.data || !metricData.data.result) return [];
    return metricData.data.result;
  };

  const cpuData = processMetricData(data['rate(node_cpu_seconds_total[5m])']);
  const memoryTotal = processMetricData(data['node_memory_MemTotal_bytes']);
  const memoryAvailable = processMetricData(data['node_memory_MemAvailable_bytes']);
  const diskSize = processMetricData(data['node_filesystem_size_bytes']);
  const diskAvail = processMetricData(data['node_filesystem_avail_bytes']);
  const networkRx = processMetricData(data['node_network_receive_bytes_total']);
  const networkTx = processMetricData(data['node_network_transmit_bytes_total']);
  const load1 = processMetricData(data['node_load1']);
  const load5 = processMetricData(data['node_load5']);
  const load15 = processMetricData(data['node_load15']);

  // Calculs pour les métriques principales
  const calculateCpuUsage = () => {
    if (!cpuData.length) return 0;
    const totalUsage = cpuData.reduce((sum, cpu) => {
      const value = parseFloat(cpu.value[1]);
      return sum + (isNaN(value) ? 0 : value * 100);
    }, 0);
    return Math.round(totalUsage / cpuData.length);
  };

  const calculateMemoryUsage = () => {
    if (!memoryTotal.length || !memoryAvailable.length) return { used: 0, total: 0, percentage: 0 };
    const total = parseFloat(memoryTotal[0].value[1]);
    const available = parseFloat(memoryAvailable[0].value[1]);
    const used = total - available;
    const percentage = Math.round((used / total) * 100);
    return { 
      used: Math.round(used / 1024 / 1024 / 1024), 
      total: Math.round(total / 1024 / 1024 / 1024), 
      percentage 
    };
  };

  const calculateDiskUsage = () => {
    if (!diskSize.length || !diskAvail.length) return [];
    return diskSize.map((disk, index) => {
      const size = parseFloat(disk.value[1]);
      const avail = diskAvail[index] ? parseFloat(diskAvail[index].value[1]) : 0;
      const used = size - avail;
      const percentage = size > 0 ? Math.round((used / size) * 100) : 0;
      return {
        device: disk.metric.device || 'Unknown',
        mountpoint: disk.metric.mountpoint || '/',
        used: Math.round(used / 1024 / 1024 / 1024),
        total: Math.round(size / 1024 / 1024 / 1024),
        percentage
      };
    }).filter(disk => disk.total > 0);
  };

  const cpuUsage = calculateCpuUsage();
  const memoryUsage = calculateMemoryUsage();
  const diskUsage = calculateDiskUsage();

  // Données pour les graphiques
  const cpuChartData = cpuData.map((cpu, index) => ({
    core: `CPU ${index}`,
    usage: Math.round(parseFloat(cpu.value[1]) * 100)
  }));

  const memoryChartData = [
    { name: 'Utilisée', value: memoryUsage.used, color: '#ef4444' },
    { name: 'Disponible', value: memoryUsage.total - memoryUsage.used, color: '#22c55e' }
  ];

  const loadChartData = [
    {
      time: 'Load Average',
      '1min': load1.length ? parseFloat(load1[0].value[1]) : 0,
      '5min': load5.length ? parseFloat(load5[0].value[1]) : 0,
      '15min': load15.length ? parseFloat(load15[0].value[1]) : 0
    }
  ];

  const networkChartData = networkRx.map((rx, index) => {
    const txData = networkTx[index];
    return {
      interface: rx.metric.device || `eth${index}`,
      rx: Math.round(parseFloat(rx.value[1]) / 1024 / 1024),
      tx: txData ? Math.round(parseFloat(txData.value[1]) / 1024 / 1024) : 0
    };
  }).filter(net => net.interface !== 'lo'); // Exclure loopback

  const ChartContainer = ({ title, children, chartId }) => (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-medium text-gray-900">{title}</h4>
        <button
          onClick={() => toggleChart(chartId)}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
        >
          {visibleCharts[chartId] ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
      {visibleCharts[chartId] && children}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Métriques principales */}
      {visibleCharts.overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Utilisation CPU"
            value={cpuUsage}
            unit="%"
            icon={CpuChipIcon}
            color={cpuUsage > 80 ? 'error' : cpuUsage > 60 ? 'warning' : 'success'}
          />
          <MetricCard
            title="Mémoire utilisée"
            value={memoryUsage.percentage}
            unit="%"
            icon={CircleStackIcon}
            color={memoryUsage.percentage > 80 ? 'error' : memoryUsage.percentage > 60 ? 'warning' : 'success'}
          />
          <MetricCard
            title="Load Average (1m)"
            value={load1.length ? parseFloat(load1[0].value[1]).toFixed(2) : 0}
            unit=""
            icon={ServerIcon}
            color="primary"
          />
          <MetricCard
            title="Interfaces réseau"
            value={networkChartData.length}
            unit="actives"
            icon={WifiIcon}
            color="primary"
          />
        </div>
      )}

      {/* Graphique CPU par core */}
      <ChartContainer title="Utilisation CPU par Core" chartId="cpu">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={cpuChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="core" />
            <YAxis domain={[0, 100]} />
            <Tooltip formatter={(value) => [`${value}%`, 'Utilisation']} />
            <Bar dataKey="usage" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Graphique mémoire */}
      <ChartContainer title="Utilisation Mémoire" chartId="memory">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={memoryChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {memoryChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} GB`, 'Mémoire']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col justify-center space-y-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{memoryUsage.total} GB</div>
              <div className="text-sm text-blue-800">Mémoire totale</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{memoryUsage.used} GB</div>
              <div className="text-sm text-red-800">Mémoire utilisée</div>
            </div>
          </div>
        </div>
      </ChartContainer>

      {/* Graphique disques */}
      {diskUsage.length > 0 && (
        <ChartContainer title="Utilisation des Disques" chartId="disk">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={diskUsage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mountpoint" />
              <YAxis />
              <Tooltip formatter={(value, name) => {
                if (name === 'percentage') return [`${value}%`, 'Utilisation'];
                return [`${value} GB`, name === 'used' ? 'Utilisé' : 'Total'];
              }} />
              <Legend />
              <Bar dataKey="used" fill="#ef4444" name="Utilisé (GB)" />
              <Bar dataKey="total" fill="#22c55e" name="Total (GB)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {/* Graphique réseau */}
      {networkChartData.length > 0 && (
        <ChartContainer title="Trafic Réseau (Total)" chartId="network">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={networkChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="interface" />
              <YAxis />
              <Tooltip formatter={(value) => [`${value} MB`, 'Trafic']} />
              <Legend />
              <Bar dataKey="rx" fill="#3b82f6" name="Reçu (MB)" />
              <Bar dataKey="tx" fill="#10b981" name="Envoyé (MB)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {/* Graphique load average */}
      <ChartContainer title="Load Average" chartId="load">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={loadChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="1min" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="1 minute" />
            <Area type="monotone" dataKey="5min" stackId="2" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="5 minutes" />
            <Area type="monotone" dataKey="15min" stackId="3" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="15 minutes" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Détails système */}
      <div className="card">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Informations Système</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h5 className="font-medium text-gray-700 mb-2">CPU</h5>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Cores détectés:</span>
                <span className="font-medium">{cpuData.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Utilisation moyenne:</span>
                <span className="font-medium">{cpuUsage}%</span>
              </div>
            </div>
          </div>
          
          <div>
            <h5 className="font-medium text-gray-700 mb-2">Mémoire</h5>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total:</span>
                <span className="font-medium">{memoryUsage.total} GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Disponible:</span>
                <span className="font-medium">{memoryUsage.total - memoryUsage.used} GB</span>
              </div>
            </div>
          </div>
          
          <div>
            <h5 className="font-medium text-gray-700 mb-2">Réseau</h5>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Interfaces:</span>
                <span className="font-medium">{networkChartData.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total RX:</span>
                <span className="font-medium">
                  {networkChartData.reduce((sum, net) => sum + net.rx, 0)} MB
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeExporterCharts;