import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
const MAX_DATA_POINTS = 500; // Augmenté pour plus de détails
const UPDATE_THROTTLE_MS = 500; // Réduit pour plus de fluidité


const Visualization = ({ selectedHistoricalTest, onClearSelection }) => {
  const [activeSection, setActiveSection] = useState('locust');
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [historicalMode, setHistoricalMode] = useState(false);
  
  // Refs pour éviter les re-créations inutiles
  const refreshIntervalRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  const dataBufferRef = useRef({ locust: null, node: null });

  // ===================================================================
  //          HISTORIQUE DES DONNÉES AVEC useRef (NOUVELLE APPROCHE)
  // ===================================================================
  
  // Historique Locust - stocké dans une référence pour éviter les re-rendus
  const locustHistoryRef = useRef({
    latestData: null,
    responseTime: [],
    requestsRate: [],
    errorRate: [],
    userCount: [],
    requestsTotal: [],
    failuresTotal: []
  });

  const nodeHistoryRef = useRef({
    latestData: null,
    cpu: [],
    memory: [],
    disk: [],
    network: [],
    load: []
  });

  // Cet état servira à déclencher manuellement le re-rendu des graphiques
  const [historyVersion, setHistoryVersion] = useState(0);

  // Dernières données reçues (pour les métriques instantanées)
  // const [latestLocustData, setLatestLocustData] = useState(null);
  // const [latestNodeData, setLatestNodeData] = useState(null);

  const sections = useMemo(() => [
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
  ], []);

  // ===================================================================
  //                    FONCTIONS D'ACCUMULATION DES DONNÉES
  // ===================================================================

  // Fonction utilitaire pour limiter la taille des tableaux avec optimisation
  const limitDataPoints = useCallback((dataArray) => {
    if (dataArray.length <= MAX_DATA_POINTS) return dataArray;
    // Garder les points les plus récents
    return dataArray.slice(-MAX_DATA_POINTS);
  }, []);

  // Fonction pour vérifier si les données ont significativement changé
  const hasSignificantChange = useCallback((oldData, newData, threshold = 0.1) => {
    if (!oldData || !newData) return true;
    
    // Comparer les métriques clés pour un rendu plus fluide
    const oldValue = oldData.avg_response_time || 0;
    const newValue = newData.avg_response_time || 0;
    
    // Seuil plus bas pour plus de réactivité
    return Math.abs(oldValue - newValue) > (threshold * 0.5);
  }, []);

  // Accumulation des données Locust avec throttling et useRef
  const accumulateLocustData = useCallback((newData) => {
    if (!newData || !newData.stats) return;

    const now = Date.now();
    // Throttle les mises à jour
    if (now - lastUpdateTimeRef.current < UPDATE_THROTTLE_MS) {
      dataBufferRef.current.locust = newData;
      return;
    }
    

    const dataToProcess = dataBufferRef.current.locust || newData;
    lastUpdateTimeRef.current = now;
    
    const timestamp = new Date().toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    const aggregatedStats = dataToProcess.stats.find(stat => stat.name === 'Aggregated') || {};

    // Vérifier si les données ont changé de manière significative
    const currentHistory = locustHistoryRef.current;
    const lastPoint = currentHistory.responseTime[currentHistory.responseTime.length - 1];
    if (lastPoint && !hasSignificantChange(lastPoint, aggregatedStats)) {
      return;
    }

    // Mutez directement les tableaux dans la référence
    const newHistory = locustHistoryRef.current;
    newHistory.latestData = dataToProcess; // Stockez les dernières données ici


    // Point de données pour les temps de réponse
    const responseTimePoint = {
      time: timestamp,
      avg: Math.round(aggregatedStats.avg_response_time || 0),
      median: Math.round(aggregatedStats.median_response_time || 0),
      p95: Math.round(aggregatedStats['95%_response_time'] || 0),
      min: Math.round(aggregatedStats.min_response_time || 0),
      max: Math.round(aggregatedStats.max_response_time || 0)
    };

    // Point de données pour le taux de requêtes
    const requestsRatePoint = {
      time: timestamp,
      rps: Math.round((aggregatedStats.current_rps || 0) * 10) / 10,
      totalRps: Math.round((aggregatedStats.total_rps || 0) * 10) / 10
    };

    // Point de données pour les erreurs
    const errorRatePoint = {
      time: timestamp,
      errorRate: aggregatedStats.num_requests > 0 ? 
        Math.round((aggregatedStats.num_failures / aggregatedStats.num_requests) * 100 * 10) / 10 : 0,
      failures: aggregatedStats.num_failures || 0,
      requests: aggregatedStats.num_requests || 0
    };

    // Point de données pour les utilisateurs
    const userCountPoint = {
      time: timestamp,
      users: dataToProcess.user_count || 0,
      state: dataToProcess.state === 'running' ? 1 : 0
    };

    // Point de données pour le total des requêtes
    const requestsTotalPoint = {
      time: timestamp,
      total: aggregatedStats.num_requests || 0,
      successes: (aggregatedStats.num_requests || 0) - (aggregatedStats.num_failures || 0),
      failures: aggregatedStats.num_failures || 0
    };

    // Ajouter les nouveaux points et limiter la taille
    
    newHistory.responseTime = limitDataPoints([...newHistory.responseTime, responseTimePoint]);
    newHistory.requestsRate = limitDataPoints([...newHistory.requestsRate, requestsRatePoint]);
    newHistory.errorRate = limitDataPoints([...newHistory.errorRate, errorRatePoint]);
    newHistory.userCount = limitDataPoints([...newHistory.userCount, userCountPoint]);
    newHistory.requestsTotal = limitDataPoints([...newHistory.requestsTotal, requestsTotalPoint]);

    // Mettre à jour les dernières données
    //setLatestLocustData(dataToProcess);
    setLastUpdate(new Date());
    
    // Forcez un re-rendu des graphiques en changeant la version
    setHistoryVersion(v => v + 1);
    
    // Nettoyer le buffer
    dataBufferRef.current.locust = null;
  }, [limitDataPoints, hasSignificantChange]);

  // Accumulation des données Node Exporter avec throttling et useRef
  const accumulateNodeData = useCallback((newData) => {
    if (!newData) return;

    const now = Date.now();
    // Throttle les mises à jour pour Node aussi
    if (now - lastUpdateTimeRef.current < UPDATE_THROTTLE_MS) {
      dataBufferRef.current.node = newData;
      return;
    }

    const dataToProcess = dataBufferRef.current.node || newData;
    lastUpdateTimeRef.current = now;

    const timestamp = new Date().toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });

    // Fonction utilitaire pour traiter les métriques Prometheus
    const processMetricData = (metricData) => {
      if (!metricData || !metricData.data || !metricData.data.result) return [];
      return metricData.data.result;
    };

    const cpuData = processMetricData(dataToProcess['rate(node_cpu_seconds_total[5m])']);
    const memoryTotal = processMetricData(dataToProcess['node_memory_MemTotal_bytes']);
    const memoryAvailable = processMetricData(dataToProcess['node_memory_MemAvailable_bytes']);
    const diskSize = processMetricData(dataToProcess['node_filesystem_size_bytes']);
    const diskAvail = processMetricData(dataToProcess['node_filesystem_avail_bytes']);
    const networkRx = processMetricData(dataToProcess['node_network_receive_bytes_total']);
    const networkTx = processMetricData(dataToProcess['node_network_transmit_bytes_total']);
    const load1 = processMetricData(dataToProcess['node_load1']);
    const load5 = processMetricData(dataToProcess['node_load5']);
    const load15 = processMetricData(dataToProcess['node_load15']);

    // Mutez directement les tableaux dans la référence
    const newHistory = nodeHistoryRef.current;
    newHistory.latestData = dataToProcess; // Stockez les dernières données ici

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
      load1: load1.length ? Math.round(parseFloat(load1[0].value[1]) * 100) / 100 : 0,
      load5: load5.length ? Math.round(parseFloat(load5[0].value[1]) * 100) / 100 : 0,
      load15: load15.length ? Math.round(parseFloat(load15[0].value[1]) * 100) / 100 : 0
    };

    // Ajouter les nouveaux points et limiter la taille
    newHistory.cpu = limitDataPoints([...newHistory.cpu, cpuPoint]);
    newHistory.memory = limitDataPoints([...newHistory.memory, memoryPoint]);
    newHistory.disk = limitDataPoints([...newHistory.disk, diskPoint]);
    newHistory.network = limitDataPoints([...newHistory.network, networkPoint]);
    newHistory.load = limitDataPoints([...newHistory.load, loadPoint]);

    // Mettre à jour les dernières données
    //setLatestNodeData(newData);
    setLastUpdate(new Date());
    
    // Forcez un re-rendu des graphiques en changeant la version
    setHistoryVersion(v => v + 1);
    
    // Nettoyer le buffer
    dataBufferRef.current.node = null;
  }, [limitDataPoints]);

  // ===================================================================
  //                    GESTION DES WEBSOCKETS ET API
  // ===================================================================

  // Écouter les événements WebSocket pour les métriques Locust
  useWebSocket('stats_update', useCallback((data) => {
    accumulateLocustData(data.stats);
  }, [accumulateLocustData]));

  useWebSocket('test_started', useCallback(() => {
    setIsTestRunning(true);
    setAutoRefresh(true);
  }, []));

  useWebSocket('test_stopped', useCallback(() => {
    setIsTestRunning(false);
    setAutoRefresh(false);
  }, []));

  useWebSocket('test_completed', useCallback(() => {
    setIsTestRunning(false);
    setAutoRefresh(false);
  }, []));

  // Fonction pour récupérer les données Locust
  const fetchLocustData = useCallback(async () => {
    try {
      const data = await metricsService.getLocustMetrics();
      accumulateLocustData(data);
    } catch (error) {
      console.error('Erreur récupération métriques Locust:', error);
    }
  }, [accumulateLocustData]);

  // Fonction pour récupérer les données Node Exporter via Prometheus
  const fetchNodeData = useCallback(async () => {
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
      
      console.log('Données Node récupérées:', results); // Debug
      accumulateNodeData(results);
    } catch (error) {
      console.error('Erreur récupération métriques Node:', error);
    }
  }, [accumulateNodeData]);

  // Fonction pour récupérer toutes les données
  const fetchAllData = useCallback(async () => {
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
  }, [isTestRunning, fetchLocustData, fetchNodeData]);

  // Fonction pour vider l'historique avec useRef
  const clearHistory = useCallback(() => {
    // Réinitialisez les références
    locustHistoryRef.current = {
      responseTime: [],
      requestsRate: [],
      errorRate: [],
      userCount: [],
      requestsTotal: [],
      failuresTotal: []
    };
    nodeHistoryRef.current = {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      load: []
    };
    
    // Réinitialisez les autres états
    // setLatestLocustData(null);
    // setLatestNodeData(null);
    setLastUpdate(null);
    
    // Forcez le re-rendu pour afficher les graphiques vides
    setHistoryVersion(v => v + 1);
    
    // Nettoyer les buffers
    dataBufferRef.current = { locust: null, node: null };
  }, []);

  // ===================================================================
  //                    EFFETS ET GESTION DU CYCLE DE VIE
  // ===================================================================

  // Effet pour le chargement initial
  useEffect(() => {
    // Si on a un test historique sélectionné, passer en mode historique
    if (selectedHistoricalTest) {
      setHistoricalMode(true);
      setAutoRefresh(false);
      // Charger les données historiques pour ce test
      loadHistoricalTestData(selectedHistoricalTest);
    } else {
      setHistoricalMode(false);
      fetchAllData();
    }
  }, [selectedHistoricalTest, fetchAllData]);

  // Fonction pour charger les données d'un test historique
  const loadHistoricalTestData = useCallback(async (testData) => {
    try {
      setLoading(true);
      
      // Simuler des données historiques basées sur les informations du test
      // En production, vous récupéreriez les vraies données depuis la base
      const mockHistoricalData = generateMockHistoricalData(testData);
      
      // Remplir les références avec les données historiques
      locustHistoryRef.current = mockHistoricalData.locust;
      nodeHistoryRef.current = mockHistoricalData.node;
      
      // Forcer le re-rendu
      setHistoryVersion(v => v + 1);
      setLastUpdate(new Date(testData.end_time || testData.start_time));
      
    } catch (error) {
      console.error('Erreur chargement données historiques:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fonction pour générer des données historiques simulées
  const generateMockHistoricalData = useCallback((testData) => {
    const startTime = new Date(testData.start_time);
    const endTime = new Date(testData.end_time || Date.now());
    const duration = endTime - startTime;
    const points = Math.min(100, Math.max(10, Math.floor(duration / 30000))); // Un point toutes les 30 secondes
    
    const locustData = {
      latestData: null,
      responseTime: [],
      requestsRate: [],
      errorRate: [],
      userCount: [],
      requestsTotal: []
    };
    
    const nodeData = {
      latestData: null,
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      load: []
    };
    
    // Générer des points de données simulés
    for (let i = 0; i < points; i++) {
      const timestamp = new Date(startTime.getTime() + (duration * i / points));
      const timeStr = timestamp.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      
      // Données Locust simulées
      const progress = i / points;
      const baseResponseTime = testData.avg_response_time || 200;
      const baseRps = testData.requests_per_second || 10;
      const baseUsers = testData.users || 10;
      
      locustData.responseTime.push({
        time: timeStr,
        avg: Math.round(baseResponseTime * (0.8 + Math.random() * 0.4)),
        median: Math.round(baseResponseTime * 0.9 * (0.8 + Math.random() * 0.4)),
        p95: Math.round(baseResponseTime * 1.5 * (0.8 + Math.random() * 0.4)),
        min: Math.round(baseResponseTime * 0.5),
        max: Math.round(baseResponseTime * 2)
      });
      
      locustData.requestsRate.push({
        time: timeStr,
        rps: Math.round(baseRps * progress * (0.8 + Math.random() * 0.4) * 10) / 10,
        totalRps: Math.round(baseRps * progress * 10) / 10
      });
      
      locustData.errorRate.push({
        time: timeStr,
        errorRate: (testData.error_rate || 0) * (0.5 + Math.random()),
        failures: Math.floor((testData.total_failures || 0) * progress),
        requests: Math.floor((testData.total_requests || 0) * progress)
      });
      
      locustData.userCount.push({
        time: timeStr,
        users: Math.floor(baseUsers * Math.min(1, progress * 2)),
        state: progress > 0.1 ? 1 : 0
      });
      
      locustData.requestsTotal.push({
        time: timeStr,
        total: Math.floor((testData.total_requests || 0) * progress),
        successes: Math.floor(((testData.total_requests || 0) - (testData.total_failures || 0)) * progress),
        failures: Math.floor((testData.total_failures || 0) * progress)
      });
      
      // Données Node simulées
      nodeData.cpu.push({
        time: timeStr,
        usage: Math.round(30 + Math.random() * 40 + progress * 20),
        cores: 4
      });
      
      nodeData.memory.push({
        time: timeStr,
        used: Math.round(4 + Math.random() * 2 + progress),
        total: 16,
        percentage: Math.round((4 + Math.random() * 2 + progress) / 16 * 100),
        available: Math.round(16 - (4 + Math.random() * 2 + progress))
      });
      
      nodeData.disk.push({
        time: timeStr,
        used: Math.round(50 + Math.random() * 10),
        total: 100,
        percentage: Math.round(50 + Math.random() * 10),
        available: Math.round(50 - Math.random() * 10)
      });
      
      nodeData.network.push({
        time: timeStr,
        rx: Math.round(Math.random() * 100 + progress * 50),
        tx: Math.round(Math.random() * 50 + progress * 25),
        total: Math.round(Math.random() * 150 + progress * 75)
      });
      
      nodeData.load.push({
        time: timeStr,
        load1: Math.round((0.5 + Math.random() * 1.5 + progress) * 100) / 100,
        load5: Math.round((0.4 + Math.random() * 1.2 + progress * 0.8) * 100) / 100,
        load15: Math.round((0.3 + Math.random() * 1.0 + progress * 0.6) * 100) / 100
      });
    }
    
    return { locust: locustData, node: nodeData };
  }, []);

  // Effet pour l'auto-refresh des métriques Node uniquement
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchNodeData, 1000); // Refresh Node toutes les 1 seconde pour plus de fluidité
      refreshIntervalRef.current = interval;
      return () => {
        clearInterval(interval);
        refreshIntervalRef.current = null;
      };
    }
  }, [autoRefresh, fetchNodeData]);

  // Nettoyage lors du démontage
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // ===================================================================
  //                    GESTIONNAIRES D'ÉVÉNEMENTS
  // ===================================================================

  const handleRefresh = useCallback(() => {
    fetchAllData();
  }, [fetchAllData]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  // Mémoriser les données pour éviter les re-rendus inutiles
  //const memoizedLatestLocustData = useMemo(() => latestLocustData, [latestLocustData]);
  //const memoizedLatestNodeData = useMemo(() => latestNodeData, [latestNodeData]);

  // ===================================================================
  //                    RENDU DU COMPOSANT
  // ===================================================================

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-gray-900">Visualisation des Métriques</h2>
            {historicalMode && selectedHistoricalTest && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 rounded-full">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-700">
                  Mode historique: {selectedHistoricalTest.name}
                </span>
              </div>
            )}
          </div>
          <p className="text-gray-600 mt-1">
            {historicalMode 
              ? `Données historiques du test "${selectedHistoricalTest?.name}" (${new Date(selectedHistoricalTest?.start_time).toLocaleString()})`
              : `Graphiques Canvas haute performance avec historique accumulé (${MAX_DATA_POINTS} points max)`
            }
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {historicalMode && (
            <button
              onClick={() => {
                setHistoricalMode(false);
                onClearSelection();
                clearHistory();
                fetchAllData();
              }}
              className="flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <span>Retour au temps réel</span>
            </button>
          )}
          
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
            disabled={historicalMode}
            className={`flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              historicalMode
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : autoRefresh 
                ? 'bg-success-100 text-success-700 hover:bg-success-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {autoRefresh ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
            <span>{historicalMode ? 'Historique' : (autoRefresh ? 'Auto' : 'Manuel')}</span>
          </button>
          
          <button
            onClick={handleRefresh}
            disabled={loading || historicalMode}
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
          <h4 className="font-medium text-gray-900 mb-2">
            {historicalMode ? 'Données Locust (Historique)' : 'Historique Locust'}
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Points temps réponse:</span>
              <span className="font-medium ml-2">{locustHistoryRef.current.responseTime.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Points utilisateurs:</span>
              <span className="font-medium ml-2">{locustHistoryRef.current.userCount.length}</span>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <h4 className="font-medium text-gray-900 mb-2">
            {historicalMode ? 'Données Système (Historique)' : 'Historique Système'}
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Points CPU:</span>
              <span className="font-medium ml-2">{nodeHistoryRef.current.cpu.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Points mémoire:</span>
              <span className="font-medium ml-2">{nodeHistoryRef.current.memory.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu des graphiques avec nouvelles props */}
      <div className="space-y-6">
        {activeSection === 'locust' && (
          <LocustMetricsCharts 
            historyRef={locustHistoryRef}
            historyVersion={historyVersion}
            //latestData={memoizedLatestLocustData}
            loading={loading}
          />
        )}
        
        {activeSection === 'node' && (
          <NodeExporterCharts 
            historyRef={nodeHistoryRef}
            historyVersion={historyVersion}
            //latestData={memoizedLatestNodeData}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};

export default Visualization;