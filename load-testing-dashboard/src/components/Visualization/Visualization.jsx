import React, { useState, useEffect } from 'react';
import { 
  ChartBarIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  CpuChipIcon,
  ServerIcon
} from '@heroicons/react/24/outline';
import { metricsService } from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import LoadingSpinner from '../Common/LoadingSpinner';
import LocustMetricsCharts from './LocustMetricsCharts';
import NodeExporterCharts from './NodeExporterCharts';

const Visualization = () => {
  const [activeSection, setActiveSection] = useState('locust');
  const [locustData, setLocustData] = useState(null);
  const [nodeData, setNodeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);

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

  // Écouter les événements WebSocket pour les métriques Locust
  useWebSocket('stats_update', (data) => {
    setLocustData(data.stats);
    setLastUpdate(new Date());
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
      setLocustData(data);
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
      setNodeData(results);
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
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erreur récupération données:', error);
    } finally {
      setLoading(false);
    }
  };

  // Effet pour le chargement initial
  useEffect(() => {
    fetchAllData();
  }, []);

  // Effet pour l'auto-refresh des métriques Node uniquement
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchNodeData, 5000); // Refresh Node toutes les 5 secondes
      return () => clearInterval(interval);
    }
  }, [autoRefresh, isTestRunning]);

  const handleRefresh = () => {
    fetchAllData();
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Visualisation des Métriques</h2>
          <p className="text-gray-600 mt-1">
            Graphiques dynamiques des métriques Locust (WebSocket) et système en temps réel
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {isTestRunning && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-success-50 rounded-full">
              <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-success-700">
                Données temps réel
              </span>
            </div>
          )}
          
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Dernière MAJ: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          
          <button
            onClick={toggleAutoRefresh}
            className={`flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              autoRefresh 
                ? 'bg-success-100 text-success-700 hover:bg-success-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {autoRefresh ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
            <span>{autoRefresh ? 'Auto Node' : 'Manuel'}</span>
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

      {/* Contenu des graphiques */}
      <div className="space-y-6">
        {activeSection === 'locust' && (
          <LocustMetricsCharts 
            data={locustData} 
            loading={loading}
            onRefresh={fetchLocustData}
          />
        )}
        
        {activeSection === 'node' && (
          <NodeExporterCharts 
            data={nodeData} 
            loading={loading}
            onRefresh={fetchNodeData}
          />
        )}
      </div>
    </div>
  );
};

export default Visualization;