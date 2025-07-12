import React, { useState } from 'react';
import { memo } from 'react';
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

  // Extraire les métriques actuelles des dernières données
  const getCurrentMetrics = () => {
    if (!latestData || !latestData.stats) return {};
    return latestData.stats.find(stat => stat.name === 'Aggregated') || {};
  };

  const aggregatedStats = getCurrentMetrics();

  const ChartContainer = memo(({ title, children, chartId, dataCount = 0 }) => (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-lg font-medium text-gray-900">{title}</h4>
          <p className="text-sm text-gray-500">{dataCount} points de données</p>
        </div>
        <button
          onClick={() => toggleChart(chartId)}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
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
            value={latestData?.user_count || 0}
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

      {/* Graphique temporel des temps de réponse */}
      <ChartContainer 
        title="Évolution des Temps de Réponse" 
        chartId="responseTime"
        dataCount={history.responseTime?.length || 0}
      >
        {history.responseTime && history.responseTime.length > 0 ? (
          <ResponsiveContainer width="100%" height={300} debounce={100}>
            <LineChart data={history.responseTime}>
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
        dataCount={history.requestsRate?.length || 0}
      >
        {history.requestsRate && history.requestsRate.length > 0 ? (
          <ResponsiveContainer width="100%" height={300} debounce={100}>
            <AreaChart data={history.requestsRate}>
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
        dataCount={history.errorRate?.length || 0}
      >
        {history.errorRate && history.errorRate.length > 0 ? (
          <ResponsiveContainer width="100%" height={300} debounce={100}>
            <LineChart data={history.errorRate}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                interval="preserveStartEnd"
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
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
        dataCount={history.requestsTotal?.length || 0}
      >
        {history.requestsTotal && history.requestsTotal.length > 0 ? (
          <ResponsiveContainer width="100%" height={300} debounce={100}>
            <AreaChart data={history.requestsTotal}>
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
        dataCount={history.userCount?.length || 0}
      >
        {history.userCount && history.userCount.length > 0 ? (
          <ResponsiveContainer width="100%" height={300} debounce={100}>
            <LineChart data={history.userCount}>
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
                {aggregatedStats.total_rps ? Math.round(aggregatedStats.total_rps * 10) / 10 : 0}
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
            <div className="text-lg font-bold text-gray-700">{history.responseTime?.length || 0}</div>
            <div className="text-xs text-gray-600">Points temps réponse</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-gray-700">{history.requestsRate?.length || 0}</div>
            <div className="text-xs text-gray-600">Points taux requêtes</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-gray-700">{history.userCount?.length || 0}</div>
            <div className="text-xs text-gray-600">Points utilisateurs</div>
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Comparaison personnalisée pour éviter les re-rendus inutiles
  return (
    prevProps.loading === nextProps.loading &&
    prevProps.history === nextProps.history &&
    prevProps.latestData === nextProps.latestData
  );
});

export default LocustMetricsCharts;