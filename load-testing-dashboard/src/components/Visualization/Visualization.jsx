import React, { useState, useEffect, useCallback } from 'react';
import { 
  ChartBarIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  CpuChipIcon,
  ServerIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { metricsService } from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import LoadingSpinner from '../Common/LoadingSpinner';
import LocustMetricsCharts from './LocustMetricsCharts';
import NodeExporterCharts from './NodeExporterCharts';

// Nombre maximum de points de données à conserver dans les graphiques pour la performance
const MAX_DATA_POINTS = 100; // par minutes avant de rafraîchir

const Visualization = () => {
  const [activeSection, setActiveSection] = useState('locust');
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // ===================================================================
  //                    HISTORIQUE DES DONNÉES CENTRALISÉ
  // ===================================================================
  
  // Historique Locust - accumulé au fil du temps
  const [locustHistory, setLocustHistory] = useState({
    responseTime: [],
    requestsRate: [],
    errorRate: [],
    userCount: [],
    requestsTotal: [],
    failuresTotal: []
  });

  // Historique Node Exporter - accumulé au fil du temps
  const [nodeHistory, setNodeHistory] = useState({
    cpu: [],
    memory: [],
    disk: [],
    network: [],
    load: []
  });

  // Dernières données reçues (pour les métriques instantanées)
  const [latestLocustData, setLatestLocustData] = useState(null);
  const [latestNodeData, setLatestNodeData] = useState(null);
  
  // État pour éviter les re-rendus inutiles
  const [lastLocustUpdate, setLastLocustUpdate] = useState(0);
  const [lastNodeUpdate, setLastNodeUpdate] = useState(0);

  const sections = [
    {
      id: 'locust',
      name: 'Métriques Locust',
      description: 'Tests de charge et performances',
      icon: CpuChipIcon,
      color: 'text-green-600'
    },
    {
      id: 'node',
      name: 'Métriques Système',
      description: 'Performances serveur et ressources',
      icon: ServerIcon,
      color: 'text-blue-600'
    }
  ];

  // ===================================================================
  //                    FONCTIONS D'ACCUMULATION DES DONNÉES
  // ===================================================================

  // Fonction utilitaire pour limiter la taille des tableaux
  const limitDataPoints = useCallback((dataArray) => {
    return dataArray.slice(-MAX_DATA_POINTS);
  }, []);

  // Accumulation des données Locust
  const accumulateLocustData = useCallback((newData) => {
    if (!newData || !newData.stats) return;

    const now = Date.now();
    // Éviter les mises à jour trop fréquentes (minimum 1 seconde)
    if (now - lastLocustUpdate < 1000) return;
    setLastLocustUpdate(now);
    const timestamp = new Date().toLocaleTimeString();
    const aggregatedStats = newData.stats.find(stat => stat.name === 'Aggregated') || {};

    setLocustHistory(prevHistory => {
      // Vérifier si les données ont vraiment changé
      const lastPoint = prevHistory.responseTime[prevHistory.responseTime.length - 1];
      const newAvgResponseTime = aggregatedStats.avg_response_time || 0;
      
      if (lastPoint && Math.abs(lastPoint.avg - newAvgResponseTime) < 0.1) {
        // Pas de changement significatif, ne pas mettre à jour
        return prevHistory;
      }
      
      const newHistory = { ...prevHistory };

      // Point de données pour les temps de réponse
      const responseTimePoint = {
        time: timestamp,
        avg: aggregatedStats.avg_response_time || 0,
        median: aggregatedStats.median_response_time || 0,
        p95: aggregatedStats['95%_response_time'] || 0,
        min: aggregatedStats.min_response_time || 0,
        max: aggregatedStats.max_response_time || 0
      };

      // Point de données pour le taux de requêtes
      const requestsRatePoint = {
        time: timestamp,
        rps: aggregatedStats.current_rps || 0,
        totalRps: aggregatedStats.total_rps || 0
      };

      // Point de données pour les erreurs
      const errorRatePoint = {
        time: timestamp,
        errorRate: aggregatedStats.num_requests > 0 ? 
          (aggregatedStats.num_failures / aggregatedStats.num_requests) * 100 : 0,
        failures: aggregatedStats.num_failures || 0,
        requests: aggregatedStats.num_requests || 0
      };

      // Point de données pour les utilisateurs
      const userCountPoint = {
        time: timestamp,
        users: newData.user_count || 0,
        state: newData.state === 'running' ? 1 : 0
      };

      // Point de données pour le total des requêtes
      const requestsTotalPoint = {
        time: timestamp,
        total: aggregatedStats.num_requests || 0,
        successes: (aggregatedStats.num_requests || 0) - (aggregatedStats.num_failures || 0),
        failures: aggregatedStats.num_failures || 0
      };

      // Point de données pour les échecs
      const failuresTotalPoint = {
        time: timestamp,
        failures: aggregatedStats.num_failures || 0,
        rate: aggregatedStats.num_requests > 0 ? 
          (aggregatedStats.num_failures / aggregatedStats.num_requests) * 100 : 0
      };

      // Ajouter les nouveaux points et limiter la taille
      newHistory.responseTime = limitDataPoints([...prevHistory.responseTime, responseTimePoint]);
      newHistory.requestsRate = limitDataPoints([...prevHistory.requestsRate, requestsRatePoint]);
      newHistory.errorRate = limitDataPoints([...prevHistory.errorRate, errorRatePoint]);
      newHistory.userCount = limitDataPoints([...prevHistory.userCount, userCountPoint]);
      newHistory.requestsTotal = limitDataPoints([...prevHistory.requestsTotal, requestsTotalPoint]);
      newHistory.failuresTotal = limitDataPoints([...prevHistory.failuresTotal, failuresTotalPoint]);

      return newHistory;
    });

    // Mettre à jour les dernières données
    setLatestLocustData(newData);
    setLastUpdate(new Date());
  }, [limitDataPoints, lastLocustUpdate]);

  // Accumulation des données Node Exporter
  const accumulateNodeData = useCallback((newData) => {
    if (!newData) return;

    const timestamp = new Date().toLocaleTimeString();

    // Fonction utilitaire pour traiter les métriques Prometheus
    const processMetricData = (metricData) => {
      if (!metricData || !metricData.data || !metricData.data.result) return [];
      return metricData.data.result;
    };

    const cpuData = processMetricData(newData['rate(node_cpu_seconds_total[5m])']);
    const memoryTotal = processMetricData(newData['node_memory_MemTotal_bytes']);
    const memoryAvailable = processMetricData(newData['node_memory_MemAvailable_bytes']);
    const diskSize = processMetricData(newData['node_filesystem_size_bytes']);
    const diskAvail = processMetricData(newData['node_filesystem_avail_bytes']);
    const networkRx = processMetricData(newData['node_network_receive_bytes_total']);
    const networkTx = processMetricData(newData['node_network_transmit_bytes_total']);
    const load1 = processMetricData(newData['node_load1']);
    const load5 = processMetricData(newData['node_load5']);
    const load15 = processMetricData(newData['node_load15']);

    setNodeHistory(prev => {
      const newHistory = { ...prev };

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

      // Points de données
      const cpuPoint = {
        time: timestamp,
        usage: cpuUsage,
        cores: cpuData.length
      };

      const memoryPoint = {
        time: timestamp,
        used: memoryUsage.used,
        total: memoryUsage.total,
        percentage: memoryUsage.percentage,
        available: memoryUsage.total - memoryUsage.used
      };

      const diskPoint = {
        time: timestamp,
        used: diskUsage.used,
        total: diskUsage.total,
        percentage: diskUsage.percentage,
        available: diskUsage.total - diskUsage.used
      };

      const networkPoint = {
        time: timestamp,
        rx: networkUsage.rx,
        tx: networkUsage.tx,
        total: networkUsage.rx + networkUsage.tx
      };

      const loadPoint = {
        time: timestamp,
        load1: load1.length ? parseFloat(load1[0].value[1]) : 0,
        load5: load5.length ? parseFloat(load5[0].value[1]) : 0,
        load15: load15.length ? parseFloat(load15[0].value[1]) : 0
      };

      // Ajouter les nouveaux points et limiter la taille
      newHistory.cpu = limitDataPoints([...prev.cpu, cpuPoint]);
      newHistory.memory = limitDataPoints([...prev.memory, memoryPoint]);
      newHistory.disk = limitDataPoints([...prev.disk, diskPoint]);
      newHistory.network = limitDataPoints([...prev.network, networkPoint]);
      newHistory.load = limitDataPoints([...prev.load, loadPoint]);

      return newHistory;
    });

    // Mettre à jour les dernières données
    setLatestNodeData(newData);
    setLastUpdate(new Date());
  }, [limitDataPoints]);

  // ===================================================================
  //                    GESTION DES WEBSOCKETS ET API
  // ===================================================================

  // Écouter les événements WebSocket pour les métriques Locust
  useWebSocket('stats_update', (data) => {
    accumulateLocustData(data.stats);
  });

  useWebSocket('test_started', () => {
    setIsTestRunning(true);
    setAutoRefresh(true);
  });

  useWebSocket('test_stopped', () => {
    setIsTestRunning(false);
    setAutoRefresh(false);
  });

  useWebSocket('test_completed', () => {
    setIsTestRunning(false);
    setAutoRefresh(false);
  });

  // Fonction pour récupérer les données Locust
  const fetchLocustData = async () => {
    try {
      const data = await metricsService.getLocustMetrics();
      accumulateLocustData(data);
    } catch (error) {
      console.error('Erreur récupération métriques Locust:', error);
    }
  };

  // Fonction pour récupérer les données Node Exporter via Prometheus
  const fetchNodeData = async () => {
    try {
      const queries = [
        'up{job="node_exporter"}',
        'node_cpu_seconds_total',
        'node_memory_MemTotal_bytes',
        'node_memory_MemAvailable_bytes',
        'node_filesystem_size_bytes',
        'node_filesystem_avail_bytes',
        'node_network_receive_bytes_total',
        'node_network_transmit_bytes_total',
        'node_load1',
        'node_load5',
        'node_load15',
        'rate(node_cpu_seconds_total[5m])',
        'node_disk_read_bytes_total',
        'node_disk_written_bytes_total'
      ];

      const results = {};
      for (const query of queries) {
        try {
          const result = await metricsService.query(query);
          results[query] = result;
        } catch (error) {
          console.error(`Erreur requête ${query}:`, error);
          results[query] = null;
        }
      }
      accumulateNodeData(results);
    } catch (error) {
      console.error('Erreur récupération métriques Node:', error);
    }
  };

  // Fonction pour récupérer toutes les données
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Récupérer les données Locust seulement si pas de test en cours (pour éviter les doublons avec WebSocket)
      if (!isTestRunning) {
        await fetchLocustData();
      }
      await fetchNodeData();
    } catch (error) {
      console.error('Erreur récupération données:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour vider l'historique
  const clearHistory = () => {
    setLocustHistory({
      responseTime: [],
      requestsRate: [],
      errorRate: [],
      userCount: [],
      requestsTotal: [],
      failuresTotal: []
    });
    setNodeHistory({
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      load: []
    });
    setLatestLocustData(null);
    setLatestNodeData(null);
    setLastUpdate(null);
  };

  // ===================================================================
  //                    EFFETS ET GESTION DU CYCLE DE VIE
  // ===================================================================

  // Effet pour le chargement initial
  useEffect(() => {
    fetchAllData();
  }, []);

  // Effet pour l'auto-refresh des métriques Node uniquement
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchNodeData, 3000); // Refresh Node toutes les 3 secondes
      setRefreshInterval(interval);
      return () => {
        clearInterval(interval);
        setRefreshInterval(null);
      };
    }
  }, [autoRefresh, isTestRunning]);

  // ===================================================================
  //                    GESTIONNAIRES D'ÉVÉNEMENTS
  // ===================================================================

  const handleRefresh = () => {
    fetchAllData();
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  // ===================================================================
  //                    RENDU DU COMPOSANT
  // ===================================================================

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Visualisation des Métriques</h2>
          <p className="text-gray-600 mt-1">
            Graphiques temporels avec historique accumulé ({MAX_DATA_POINTS} points max)
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {isTestRunning && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-success-50 rounded-full">
              <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-success-700">
                Flux temps réel
              </span>
            </div>
          )}
          
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              MAJ: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
            <span>{autoRefresh ? 'Continu' : 'Manuel'}</span>
          </div>
          
          <button
            onClick={clearHistory}
            className="flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            title="Vider l'historique"
          >
            <TrashIcon className="h-4 w-4" />
            <span>Vider</span>
          </button>
          
          <button
            onClick={toggleAutoRefresh}
            className={`flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              autoRefresh 
                ? 'bg-success-100 text-success-700 hover:bg-success-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {autoRefresh ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
            <span>{autoRefresh ? 'Auto' : 'Manuel'}</span>
          </button>
          
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="btn-outline"
          >
            {loading ? (
              <LoadingSpinner size="sm" className="mr-2" />
            ) : (
              <ArrowPathIcon className="h-4 w-4 mr-2" />
            )}
            Actualiser
          </button>
        </div>
      </div>

      {/* Navigation sections */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-md text-sm font-medium transition-colors duration-200 ${
                activeSection === section.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className={`h-5 w-5 ${activeSection === section.id ? section.color : ''}`} />
              <div className="text-left">
                <div>{section.name}</div>
                <div className="text-xs text-gray-500">{section.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Statistiques de l'historique */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h4 className="font-medium text-gray-900 mb-2">Historique Locust</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Points temps réponse:</span>
              <span className="font-medium ml-2">{locustHistory.responseTime.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Points utilisateurs:</span>
              <span className="font-medium ml-2">{locustHistory.userCount.length}</span>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <h4 className="font-medium text-gray-900 mb-2">Historique Système</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Points CPU:</span>
              <span className="font-medium ml-2">{nodeHistory.cpu.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Points mémoire:</span>
              <span className="font-medium ml-2">{nodeHistory.memory.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu des graphiques */}
      <div className="space-y-6">
        {activeSection === 'locust' && (
          <LocustMetricsCharts 
            history={locustHistory}
            latestData={latestLocustData}
            loading={loading}
          />
        )}
        
        {activeSection === 'node' && (
          <NodeExporterCharts 
            history={nodeHistory}
            latestData={latestNodeData}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};

export default Visualization;