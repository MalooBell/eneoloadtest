import React, { useState, memo, useMemo } from 'react';
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
  ClockIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import MetricCard from '../Common/MetricCard';

// Composant Tooltip personnalisé pour éviter les re-rendus
const CustomTooltip = memo(({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="text-sm font-medium text-gray-900">{`Temps: ${label}`}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {`${entry.name}: ${entry.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
});

const LocustMetricsCharts = memo(({ history, latestData, loading }) => {
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

  // Mémoriser les métriques actuelles pour éviter les recalculs
  const currentMetrics = useMemo(() => {
    if (!latestData || !latestData.stats) return {};
    return latestData.stats.find(stat => stat.name === 'Aggregated') || {};
  }, [latestData]);

  // Mémoriser les données des graphiques pour éviter les re-rendus
  const chartData = useMemo(() => ({
    responseTime: history.responseTime || [],
    requestsRate: history.requestsRate || [],
    errorRate: history.errorRate || [],
    userCount: history.userCount || [],
    requestsTotal: history.requestsTotal || []
  }), [history]);

  if (loading && !latestData) {
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

  if (!latestData && (!history || Object.values(history).every(arr => arr.length === 0))) {
    return (
      <div className="card text-center py-12">
        <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Aucune donnée Locust disponible
        </h3>
        <p className="text-gray-500">
          Démarrez un test pour voir les métriques temporelles s'accumuler
        </p>
      </div>
    );
  }

  const ChartContainer = memo(({ title, children, chartId, dataCount = 0 }) => (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-lg font-medium text-gray-900">{title}</h4>
          <p className="text-sm text-gray-500">{dataCount} points de données</p>
        </div>
        <button
          onClick={() => toggleChart(chartId)}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {visibleCharts[chartId] ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
      {visibleCharts[chartId] && children}
    </div>
  ));

  return (
    <div className="space-y-6">
      {/* Métriques principales */}
      {visibleCharts.overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Temps de réponse moyen"
            value={currentMetrics.avg_response_time ? Math.round(currentMetrics.avg_response_time) : 0}
            unit="ms"
            icon={ClockIcon}
            color="primary"
          />
          <MetricCard
            title="Requêtes par seconde"
            value={currentMetrics.current_rps ? Math.round(currentMetrics.current_rps * 10) / 10 : 0}
            unit="req/s"
            icon={ChartBarIcon}
            color="success"
          />
          <MetricCard
            title="Utilisateurs actifs"
            value={latestData?.user_count || 0}
            unit="users"
            icon={UserGroupIcon}
            color="primary"
          />
          <MetricCard
            title="Taux d'erreur"
            value={currentMetrics.num_requests ? 
              Math.round((currentMetrics.num_failures / currentMetrics.num_requests) * 100 * 10) / 10 : 0}
            unit="%"
            icon={ExclamationTriangleIcon}
            color={currentMetrics.num_failures > 0 ? 'error' : 'success'}
          />
        </div>
      )}

      {/* Graphique temporel des temps de réponse */}
      <ChartContainer 
        title="Évolution des Temps de Réponse" 
        chartId="responseTime"
        dataCount={chartData.responseTime.length}
      >
        {chartData.responseTime.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData.responseTime} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="time" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="avg" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Moyenne (ms)" 
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line 
                type="monotone" 
                dataKey="median" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Médiane (ms)" 
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line 
                type="monotone" 
                dataKey="p95" 
                stroke="#f59e0b" 
                strokeWidth={2}
                name="95e centile (ms)" 
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Aucune donnée de temps de réponse disponible
          </div>
        )}
      </ChartContainer>

      {/* Graphique temporel du taux de requêtes */}
      <ChartContainer 
        title="Évolution du Taux de Requêtes" 
        chartId="requestsRate"
        dataCount={chartData.requestsRate.length}
      >
        {chartData.requestsRate.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData.requestsRate} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="time" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="rps" 
                stackId="1" 
                stroke="#3b82f6" 
                fill="#3b82f6" 
                fillOpacity={0.6} 
                name="RPS Actuel" 
                isAnimationActive={false}
              />
              <Area 
                type="monotone" 
                dataKey="totalRps" 
                stackId="2" 
                stroke="#10b981" 
                fill="#10b981" 
                fillOpacity={0.4} 
                name="RPS Total" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Aucune donnée de taux de requêtes disponible
          </div>
        )}
      </ChartContainer>

      {/* Graphique temporel des erreurs */}
      <ChartContainer 
        title="Évolution des Erreurs" 
        chartId="errors"
        dataCount={chartData.errorRate.length}
      >
        {chartData.errorRate.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData.errorRate} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="time" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="failures" 
                stroke="#ef4444" 
                strokeWidth={2}
                name="Nombre d'échecs" 
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="errorRate" 
                stroke="#f59e0b" 
                strokeWidth={3}
                name="Taux d'erreur %" 
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Aucune donnée d'erreurs disponible
          </div>
        )}
      </ChartContainer>

      {/* Graphique temporel du volume total de requêtes */}
      <ChartContainer 
        title="Évolution du Volume de Requêtes" 
        chartId="distribution"
        dataCount={chartData.requestsTotal.length}
      >
        {chartData.requestsTotal.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData.requestsTotal} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="time" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="successes" 
                stackId="1" 
                stroke="#22c55e" 
                fill="#22c55e" 
                fillOpacity={0.6} 
                name="Succès" 
                isAnimationActive={false}
              />
              <Area 
                type="monotone" 
                dataKey="failures" 
                stackId="1" 
                stroke="#ef4444" 
                fill="#ef4444" 
                fillOpacity={0.6} 
                name="Échecs" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Aucune donnée de volume disponible
          </div>
        )}
      </ChartContainer>

      {/* Graphique temporel des utilisateurs */}
      <ChartContainer 
        title="Évolution des Utilisateurs Actifs" 
        chartId="users"
        dataCount={chartData.userCount.length}
      >
        {chartData.userCount.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData.userCount} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="time" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="users" 
                stroke="#3b82f6" 
                strokeWidth={3}
                name="Utilisateurs actifs" 
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Aucune donnée d'utilisateurs disponible
          </div>
        )}
      </ChartContainer>

      {/* Détails techniques en temps réel */}
      {latestData && (
        <div className="card">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Détails Techniques (Temps Réel)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Total requêtes</p>
              <p className="font-semibold text-gray-900">
                {currentMetrics.num_requests?.toLocaleString() || 0}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Min réponse</p>
              <p className="font-semibold text-gray-900">
                {currentMetrics.min_response_time || 0} ms
              </p>
            </div>
            <div>
              <p className="text-gray-500">Max réponse</p>
              <p className="font-semibold text-gray-900">
                {currentMetrics.max_response_time || 0} ms
              </p>
            </div>
            <div>
              <p className="text-gray-500">95e centile</p>
              <p className="font-semibold text-gray-900">
                {currentMetrics['95%_response_time'] || 0} ms
              </p>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{latestData.user_count || 0}</div>
              <div className="text-sm text-blue-800">Utilisateurs actifs</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{latestData.state || 'Arrêté'}</div>
              <div className="text-sm text-green-800">État du test</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {currentMetrics.total_rps ? Math.round(currentMetrics.total_rps * 10) / 10 : 0}
              </div>
              <div className="text-sm text-purple-800">RPS Total</div>
            </div>
          </div>
        </div>
      )}

      {/* Résumé de l'historique */}
      <div className="card">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Résumé de l'Historique Accumulé</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-gray-700">{chartData.responseTime.length}</div>
            <div className="text-xs text-gray-600">Points temps réponse</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-gray-700">{chartData.requestsRate.length}</div>
            <div className="text-xs text-gray-600">Points taux requêtes</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-gray-700">{chartData.userCount.length}</div>
            <div className="text-xs text-gray-600">Points utilisateurs</div>
          </div>
        </div>
      </div>
    </div>
  );
});

LocustMetricsCharts.displayName = 'LocustMetricsCharts';

export default LocustMetricsCharts;