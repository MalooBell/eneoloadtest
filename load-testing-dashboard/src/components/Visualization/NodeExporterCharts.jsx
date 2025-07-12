import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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

  // État pour accumuler les données temporelles
  const [timeSeriesData, setTimeSeriesData] = useState({
    cpu: [],
    memory: [],
    disk: [],
    network: [],
    load: []
  });

  const [maxDataPoints] = useState(50); // Limite le nombre de points pour la performance

  const toggleChart = (chartId) => {
    setVisibleCharts(prev => ({
      ...prev,
      [chartId]: !prev[chartId]
    }));
  };

  // Effet pour accumuler les données au fil du temps
  useEffect(() => {
    if (!data) return;

    const timestamp = new Date().toLocaleTimeString();

    setTimeSeriesData(prev => {
      const newData = { ...prev };

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

      // Calculs pour CPU
      const calculateCpuUsage = () => {
        if (!cpuData.length) return 0;
        const totalUsage = cpuData.reduce((sum, cpu) => {
          const value = parseFloat(cpu.value[1]);
          return sum + (isNaN(value) ? 0 : value * 100);
        }, 0);
        return Math.round(totalUsage / cpuData.length);
      };

      // Calculs pour mémoire
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

      // Calculs pour disque
      const calculateDiskUsage = () => {
        if (!diskSize.length || !diskAvail.length) return { percentage: 0, used: 0, total: 0 };
        const size = parseFloat(diskSize[0].value[1]);
        const avail = diskAvail[0] ? parseFloat(diskAvail[0].value[1]) : 0;
        const used = size - avail;
        const percentage = size > 0 ? Math.round((used / size) * 100) : 0;
        return {
          used: Math.round(used / 1024 / 1024 / 1024),
          total: Math.round(size / 1024 / 1024 / 1024),
          percentage
        };
      };

      // Calculs pour réseau
      const calculateNetworkUsage = () => {
        if (!networkRx.length || !networkTx.length) return { rx: 0, tx: 0 };
        const rx = Math.round(parseFloat(networkRx[0].value[1]) / 1024 / 1024);
        const tx = Math.round(parseFloat(networkTx[0].value[1]) / 1024 / 1024);
        return { rx, tx };
      };

      const cpuUsage = calculateCpuUsage();
      const memoryUsage = calculateMemoryUsage();
      const diskUsage = calculateDiskUsage();
      const networkUsage = calculateNetworkUsage();

      // Ajouter les nouvelles données avec timestamp
      const newCpuPoint = {
        time: timestamp,
        usage: cpuUsage,
        cores: cpuData.length
      };

      const newMemoryPoint = {
        time: timestamp,
        used: memoryUsage.used,
        total: memoryUsage.total,
        percentage: memoryUsage.percentage,
        available: memoryUsage.total - memoryUsage.used
      };

      const newDiskPoint = {
        time: timestamp,
        used: diskUsage.used,
        total: diskUsage.total,
        percentage: diskUsage.percentage,
        available: diskUsage.total - diskUsage.used
      };

      const newNetworkPoint = {
        time: timestamp,
        rx: networkUsage.rx,
        tx: networkUsage.tx,
        total: networkUsage.rx + networkUsage.tx
      };

      const newLoadPoint = {
        time: timestamp,
        load1: load1.length ? parseFloat(load1[0].value[1]) : 0,
        load5: load5.length ? parseFloat(load5[0].value[1]) : 0,
        load15: load15.length ? parseFloat(load15[0].value[1]) : 0
      };

      // Ajouter et limiter les données
      newData.cpu = [...prev.cpu, newCpuPoint].slice(-maxDataPoints);
      newData.memory = [...prev.memory, newMemoryPoint].slice(-maxDataPoints);
      newData.disk = [...prev.disk, newDiskPoint].slice(-maxDataPoints);
      newData.network = [...prev.network, newNetworkPoint].slice(-maxDataPoints);
      newData.load = [...prev.load, newLoadPoint].slice(-maxDataPoints);

      return newData;
    });
  }, [data, maxDataPoints]);

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
          Vérifiez que Node Exporter est démarré pour voir les métriques temporelles
        </p>
      </div>
    );
  }

  // Calculs pour les métriques actuelles
  const processMetricData = (metricData) => {
    if (!metricData || !metricData.data || !metricData.data.result) return [];
    return metricData.data.result;
  };

  const cpuData = processMetricData(data['rate(node_cpu_seconds_total[5m])']);
  const memoryTotal = processMetricData(data['node_memory_MemTotal_bytes']);
  const memoryAvailable = processMetricData(data['node_memory_MemAvailable_bytes']);
  const load1 = processMetricData(data['node_load1']);
  const networkRx = processMetricData(data['node_network_receive_bytes_total']);
  const networkTx = processMetricData(data['node_network_transmit_bytes_total']);

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

  const cpuUsage = calculateCpuUsage();
  const memoryUsage = calculateMemoryUsage();
  const networkCount = networkRx.filter(net => net.metric.device !== 'lo').length;

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
            value={networkCount}
            unit="actives"
            icon={WifiIcon}
            color="primary"
          />
        </div>
      )}

      {/* Graphique temporel CPU */}
      <ChartContainer title="Évolution de l'Utilisation CPU" chartId="cpu">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeriesData.cpu}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              angle={-45} 
              textAnchor="end" 
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis domain={[0, 100]} />
            <Tooltip formatter={(value, name) => {
              if (name === 'usage') return [`${value}%`, 'Utilisation CPU'];
              return [value, name];
            }} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="usage" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Utilisation CPU %" 
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Graphique temporel mémoire */}
      <ChartContainer title="Évolution de l'Utilisation Mémoire" chartId="memory">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={timeSeriesData.memory}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              angle={-45} 
              textAnchor="end" 
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis />
            <Tooltip formatter={(value, name) => {
              if (name === 'percentage') return [`${value}%`, 'Pourcentage'];
              return [`${value} GB`, name === 'used' ? 'Utilisée' : name === 'available' ? 'Disponible' : 'Total'];
            }} />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="used" 
              stackId="1" 
              stroke="#ef4444" 
              fill="#ef4444" 
              fillOpacity={0.6} 
              name="Utilisée (GB)" 
            />
            <Area 
              type="monotone" 
              dataKey="available" 
              stackId="1" 
              stroke="#22c55e" 
              fill="#22c55e" 
              fillOpacity={0.6} 
              name="Disponible (GB)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Graphique temporel disque */}
      <ChartContainer title="Évolution de l'Utilisation Disque" chartId="disk">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={timeSeriesData.disk}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              angle={-45} 
              textAnchor="end" 
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis />
            <Tooltip formatter={(value, name) => {
              if (name === 'percentage') return [`${value}%`, 'Pourcentage'];
              return [`${value} GB`, name === 'used' ? 'Utilisé' : name === 'available' ? 'Disponible' : 'Total'];
            }} />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="used" 
              stackId="1" 
              stroke="#ef4444" 
              fill="#ef4444" 
              fillOpacity={0.6} 
              name="Utilisé (GB)" 
            />
            <Area 
              type="monotone" 
              dataKey="available" 
              stackId="1" 
              stroke="#22c55e" 
              fill="#22c55e" 
              fillOpacity={0.6} 
              name="Disponible (GB)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Graphique temporel réseau */}
      <ChartContainer title="Évolution du Trafic Réseau" chartId="network">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={timeSeriesData.network}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              angle={-45} 
              textAnchor="end" 
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis />
            <Tooltip formatter={(value) => [`${value} MB`, 'Trafic']} />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="rx" 
              stackId="1" 
              stroke="#3b82f6" 
              fill="#3b82f6" 
              fillOpacity={0.6} 
              name="Reçu (MB)" 
            />
            <Area 
              type="monotone" 
              dataKey="tx" 
              stackId="1" 
              stroke="#10b981" 
              fill="#10b981" 
              fillOpacity={0.6} 
              name="Envoyé (MB)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Graphique temporel load average */}
      <ChartContainer title="Évolution du Load Average" chartId="load">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeriesData.load}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              angle={-45} 
              textAnchor="end" 
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="load1" 
              stroke="#ef4444" 
              strokeWidth={2}
              name="1 minute" 
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="load5" 
              stroke="#f59e0b" 
              strokeWidth={2}
              name="5 minutes" 
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="load15" 
              stroke="#10b981" 
              strokeWidth={2}
              name="15 minutes" 
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Détails système en temps réel */}
      <div className="card">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Informations Système (Temps Réel)</h4>
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
                <span className="font-medium">{networkCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total RX:</span>
                <span className="font-medium">
                  {timeSeriesData.network.length > 0 ? 
                    timeSeriesData.network[timeSeriesData.network.length - 1].rx : 0} MB
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