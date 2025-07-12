// =================================================================
//                      DÉPENDANCES ET SETUP
// =================================================================
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

// Configuration des constantes de l'application
const API_PORT = 3001;
const LOCUST_URL = 'http://localhost:8089';
const DB_FILE = './loadtest_history.db';

// Initialisation de l'application Express
const app = express();
app.use(cors()); // Autorise les requêtes cross-origin (depuis le frontend React)
app.use(express.json()); // Middleware pour parser les corps de requête JSON

// Création du serveur HTTP pour Express et le serveur WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server }); // Intégrer WebSocket avec le serveur HTTP

// =================================================================
//         NOUVELLE ROUTE : PROXY POUR PROMETHEUS
// =================================================================
const PROMETHEUS_URL = 'http://localhost:9090';

app.get('/api/metrics/query', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'La requête (query) est manquante.' });
  }

  try {
    const url = `${PROMETHEUS_URL}/api/v1/query`;
    const response = await axios.get(url, {
      params: { query }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erreur du proxy Prometheus:", error.message);
    res.status(502).json({ error: 'Erreur lors de la communication avec Prometheus.' });
  }
});

// =================================================================
//         NOUVELLE ROUTE : PROXY POUR LOCUST
// =================================================================

app.get('/api/locust/stats', async (req, res) => {
  try {
    const response = await axios.get(`${LOCUST_URL}/stats/requests`);
    res.json(response.data);
  } catch (error) {
    console.error("Erreur du proxy Locust:", error.message);
    res.status(502).json({ error: 'Erreur lors de la communication avec Locust.' });
  }
});

// =================================================================
//                      DÉMARRAGE DU SERVEUR
// =================================================================

server.listen(API_PORT, () => {
  console.log(`🚀 Serveur API démarré sur http://localhost:${API_PORT}`);
  console.log(`👂 Serveur WebSocket intégré sur le même port`);
});