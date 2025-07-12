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
  ClockIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import MetricCard from '../Common/MetricCard';

const LocustMetricsCharts = ({ data, loading }) => {
  const [visibleCharts, setVisibleCharts] = useState({
    overview: true,
    responseTime: true,
    requestsRate: true,
    errors: true,
    distribution: true,
    users: true
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

  if (!data || !data.stats) {
    return (
      <div className="card text-center py-12">
        <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Aucune donnée Locust disponible
        </h3>
        <p className="text-gray-500">
          Démarrez un test pour voir les métriques
        </p>
      </div>
    );
  }

  const aggregatedStats = data.stats.find(stat => stat.name === 'Aggregated') || {};
  const individualStats = data.stats.filter(stat => stat.name !== 'Aggregated');

  // Données pour les graphiques
  const responseTimeData = individualStats.map(stat => ({
    name: stat.name.length > 20 ? stat.name.substring(0, 20) + '...' : stat.name,
    avg: stat.avg_response_time || 0,
    min: stat.min_response_time || 0,
    max: stat.max_response_time || 0,
    median: stat.median_response_time || 0
  }));

  const requestsData = individualStats.map(stat => ({
    name: stat.name.length > 15 ? stat.name.substring(0, 15) + '...' : stat.name,
    requests: stat.num_requests || 0,
    failures: stat.num_failures || 0,
    rps: stat.current_rps || 0
  }));

  const errorsData = individualStats
    .filter(stat => stat.num_failures > 0)
    .map(stat => ({
      name: stat.name.length > 15 ? stat.name.substring(0, 15) + '...' : stat.name,
      failures: stat.num_failures,
      rate: stat.num_requests > 0 ? (stat.num_failures / stat.num_requests) * 100 : 0
    }));

  const distributionData = [
    { name: 'Succès', value: aggregatedStats.num_requests - (aggregatedStats.num_failures || 0), color: '#22c55e' },
    { name: 'Échecs', value: aggregatedStats.num_failures || 0, color: '#ef4444' }
  ];

  const usersData = [
    { time: 'Maintenant', users: data.user_count || 0, spawning: data.state === 'spawning' ? 1 : 0 }
  ];

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
            title="Temps de réponse moyen"
            value={aggregatedStats.avg_response_time ? Math.round(aggregatedStats.avg_response_time) : 0}
            unit="ms"
            icon={ClockIcon}
            color="primary"
          />
          <MetricCard
            title="Requêtes par seconde"
            value={aggregatedStats.current_rps ? Math.round(aggregatedStats.current_rps * 10) / 10 : 0}
            unit="req/s"
            icon={ChartBarIcon}
            color="success"
          />
          <MetricCard
            title="Utilisateurs actifs"
            value={data.user_count || 0}
            unit="users"
            icon={UserGroupIcon}
            color="primary"
          />
          <MetricCard
            title="Taux d'erreur"
            value={aggregatedStats.num_requests ? 
              Math.round((aggregatedStats.num_failures / aggregatedStats.num_requests) * 100 * 10) / 10 : 0}
            unit="%"
            icon={ExclamationTriangleIcon}
            color={aggregatedStats.num_failures > 0 ? 'error' : 'success'}
          />
        </div>
      )}

      {/* Graphique des temps de réponse */}
      <ChartContainer title="Temps de Réponse par Endpoint" chartId="responseTime">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={responseTimeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="avg" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Moyenne" />
            <Area type="monotone" dataKey="median" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Médiane" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Graphique des requêtes */}
      <ChartContainer title="Volume de Requêtes par Endpoint" chartId="requestsRate">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={requestsData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="requests" fill="#3b82f6" name="Requêtes totales" />
            <Bar dataKey="failures" fill="#ef4444" name="Échecs" />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Graphique des erreurs */}
      {errorsData.length > 0 && (
        <ChartContainer title="Analyse des Erreurs" chartId="errors">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={errorsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="failures" fill="#ef4444" name="Nombre d'échecs" />
              <Line yAxisId="right" type="monotone" dataKey="rate" stroke="#f59e0b" strokeWidth={3} name="Taux d'erreur %" />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {/* Distribution succès/échecs */}
      <ChartContainer title="Distribution Succès/Échecs" chartId="distribution">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={distributionData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {distributionData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* État des utilisateurs */}
      <ChartContainer title="État des Utilisateurs" chartId="users">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{data.user_count || 0}</div>
            <div className="text-sm text-blue-800">Utilisateurs actifs</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{data.state || 'Arrêté'}</div>
            <div className="text-sm text-green-800">État du test</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {aggregatedStats.total_rps ? Math.round(aggregatedStats.total_rps * 10) / 10 : 0}
            </div>
            <div className="text-sm text-purple-800">RPS Total</div>
          </div>
        </div>
      </ChartContainer>

      {/* Détails techniques */}
      <div className="card">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Détails Techniques</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Total requêtes</p>
            <p className="font-semibold text-gray-900">
              {aggregatedStats.num_requests?.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Min réponse</p>
            <p className="font-semibold text-gray-900">
              {aggregatedStats.min_response_time || 0} ms
            </p>
          </div>
          <div>
            <p className="text-gray-500">Max réponse</p>
            <p className="font-semibold text-gray-900">
              {aggregatedStats.max_response_time || 0} ms
            </p>
          </div>
          <div>
            <p className="text-gray-500">95e centile</p>
            <p className="font-semibold text-gray-900">
              {aggregatedStats['95%_response_time'] || 0} ms
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocustMetricsCharts;