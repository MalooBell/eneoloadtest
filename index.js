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
const WS_PORT = 8080;
const LOCUST_URL = 'http://localhost:8089';
const DB_FILE = './loadtest_history.db';

// Initialisation de l'application Express
const app = express();
app.use(cors()); // Autorise les requêtes cross-origin (depuis le frontend React)
app.use(express.json()); // Middleware pour parser les corps de requête JSON

// Création du serveur HTTP pour Express et le serveur WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ port: WS_PORT });

// =================================================================
//                  GESTION DE LA BASE DE DONNÉES (SQLITE)
// =================================================================

// Connexion à la base de données SQLite. Le fichier sera créé s'il n'existe pas.
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Erreur de connexion à la base de données:", err.message);
  } else {
    console.log('Connecté à la base de données SQLite.');
    // Création de la table si elle n'existe pas déjà
    db.run(`CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'stopped', 'failed')),
      start_time DATETIME,
      end_time DATETIME,
      target_url TEXT,
      users INTEGER,
      spawn_rate REAL,
      duration INTEGER,
      avg_response_time REAL,
      requests_per_second REAL,
      error_rate REAL,
      total_requests INTEGER,
      total_failures INTEGER
    )`);
  }
});


// =================================================================
//            GESTION DES WEBSOCKETS POUR LA COMMUNICATION TEMPS RÉEL
// =================================================================

// On garde une trace de tous les clients connectés
const clients = new Set();

// Variable pour stocker l'intervalle de polling des stats
let statsPollingInterval = null;

wss.on('connection', (ws) => {
  console.log('Client WebSocket connecté');
  clients.add(ws);

  // Gérer la déconnexion
  ws.on('close', () => {
    console.log('Client WebSocket déconnecté');
    clients.delete(ws);
  });

  // Gérer les erreurs
  ws.on('error', (error) => {
    console.error('Erreur WebSocket:', error);
  });
});

/**
 * Diffuse un message à tous les clients WebSocket connectés.
 * @param {object} data - L'objet de données à envoyer (sera sérialisé en JSON).
 */
function broadcast(data) {
  const jsonData = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(jsonData);
    }
  }
}

// =================================================================
//                     LOGIQUE MÉTIER (LOCUST)
// =================================================================

/**
 * Démarre le polling des statistiques de Locust.
 * Récupère les stats toutes les 2 secondes et les diffuse via WebSocket.
 * @param {number} testId - L'ID du test en cours.
 */
function startStatsPolling(testId) {
  // S'assurer qu'un seul intervalle tourne à la fois
  if (statsPollingInterval) {
    clearInterval(statsPollingInterval);
  }

  statsPollingInterval = setInterval(async () => {
    try {
      const response = await axios.get(`${LOCUST_URL}/stats/requests`);
      const stats = response.data;

      // Diffuser la mise à jour des stats
      broadcast({ type: 'stats_update', stats });
      
      // Vérifier si le test est terminé ou arrêté par Locust lui-même
      if (stats.state === 'stopped' || stats.state === 'spawning_complete') {
        const test = await getTestFromDb(testId);
        if (test && test.status === 'running') {
            console.log(`Test ${testId} complété ou arrêté côté Locust.`);
            await stopTestInternal(testId, 'completed', stats);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des stats Locust:', error.message);
      // Optionnel: arrêter le polling en cas d'erreur répétée
    }
  }, 2000); // Poll toutes les 2 secondes
}

/**
 * Arrête le polling des statistiques.
 */
function stopStatsPolling() {
  if (statsPollingInterval) {
    clearInterval(statsPollingInterval);
    statsPollingInterval = null;
    console.log('Polling des stats arrêté.');
  }
}


/**
 * Logique interne pour arrêter un test, mettre à jour la BDD et notifier les clients.
 * @param {number} testId - L'ID du test à arrêter.
 * @param {string} finalStatus - Le statut final ('completed' ou 'stopped').
 * @param {object|null} finalStats - Les statistiques finales du test.
 */
async function stopTestInternal(testId, finalStatus, finalStats = null) {
    stopStatsPolling();
    const endTime = new Date().toISOString();
    let statsToSave = {};

    // Si on n'a pas les stats finales, on tente de les récupérer une dernière fois
    if (!finalStats) {
        try {
            const response = await axios.get(`${LOCUST_URL}/stats/requests`);
            finalStats = response.data;
        } catch (error) {
            console.error("Impossible de récupérer les stats finales de Locust.", error.message);
        }
    }
    
    // Calculer les métriques agrégées si les stats sont disponibles
    if (finalStats && finalStats.stats) {
        const aggregated = finalStats.stats.find(s => s.name === 'Aggregated');
        if (aggregated) {
            statsToSave = {
                avg_response_time: aggregated.avg_response_time,
                requests_per_second: aggregated.total_rps,
                error_rate: (aggregated.num_failures / aggregated.total_requests) * 100,
                total_requests: aggregated.total_requests,
                total_failures: aggregated.num_failures
            };
        }
    }

    // Mettre à jour la base de données
    const query = `
      UPDATE tests 
      SET status = ?, end_time = ?, avg_response_time = ?, requests_per_second = ?, error_rate = ?, total_requests = ?, total_failures = ?
      WHERE id = ? AND status = 'running'
    `;
    db.run(query, [
        finalStatus, 
        endTime,
        statsToSave.avg_response_time,
        statsToSave.requests_per_second,
        statsToSave.error_rate,
        statsToSave.total_requests,
        statsToSave.total_failures,
        testId
    ], (err) => {
        if (err) console.error("Erreur MAJ BDD pour arrêt du test:", err.message);
    });

    // Notifier les clients
    const eventType = finalStatus === 'completed' ? 'test_completed' : 'test_stopped';
    broadcast({ type: eventType, testId });
    console.log(`Test ${testId} marqué comme '${finalStatus}'.`);
}


/**
 * Récupère un test depuis la BDD par son ID.
 * @param {number} testId 
 * @returns {Promise<object>}
 */
function getTestFromDb(testId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM tests WHERE id = ?', [testId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// =================================================================
//                      ROUTES DE L'API (EXPRESS)
// =================================================================

/**
 * Route pour démarrer un nouveau test de charge.
 */
app.post('/api/tests/start', async (req, res) => {
  const { name, targetUrl, users, spawnRate, duration } = req.body;
  console.log('Requête de démarrage de test reçue:', req.body);

  // Validation simple
  if (!name || !targetUrl || !users || !spawnRate) {
    return res.status(400).json({ success: false, message: 'Paramètres manquants.' });
  }

  try {
    // 1. Démarrer le swarm Locust
    const payload = new URLSearchParams();
    payload.append('user_count', users);
    payload.append('spawn_rate', spawnRate);
    payload.append('host', targetUrl);
    // Locust gère la durée via sa propre UI ou via des paramètres au démarrage,
    // on la gère ici via un timeout côté backend.
    
    await axios.post(`${LOCUST_URL}/swarm`, payload);

    // 2. Enregistrer le test en BDD
    const startTime = new Date().toISOString();
    const query = `
      INSERT INTO tests (name, status, start_time, target_url, users, spawn_rate, duration) 
      VALUES (?, 'running', ?, ?, ?, ?, ?)
    `;
    db.run(query, [name, startTime, targetUrl, users, spawnRate, duration], function(err) {
      if (err) {
        console.error("Erreur BDD lors du démarrage du test:", err.message);
        return res.status(500).json({ success: false, message: 'Erreur base de données.' });
      }

      const testId = this.lastID;
      console.log(`Test ${testId} démarré avec succès.`);

      // 3. Gérer l'arrêt automatique si une durée est spécifiée
      if (duration > 0) {
        setTimeout(async () => {
            console.log(`La durée du test ${testId} (${duration}s) est écoulée. Arrêt...`);
            await axios.get(`${LOCUST_URL}/stop`);
            // L'arrêt sera finalisé par le poller qui détectera le changement de statut.
        }, duration * 1000);
      }

      // 4. Commencer le polling et notifier les clients
      startStatsPolling(testId);
      broadcast({ type: 'test_started', testId, name });

      res.json({ success: true, testId, message: 'Test démarré.' });
    });

  } catch (error) {
    console.error('Erreur lors du démarrage du test Locust:', error.message);
    res.status(500).json({ success: false, message: 'Erreur communication avec Locust.' });
  }
});

/**
 * Route pour arrêter manuellement le test en cours.
 */
app.post('/api/tests/stop', async (req, res) => {
  console.log('Requête d\'arrêt de test reçue.');
  
  try {
    // Trouver le test en cours
    db.get("SELECT id FROM tests WHERE status = 'running' ORDER BY start_time DESC LIMIT 1", async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ success: false, message: 'Aucun test en cours trouvé.' });
      }
      
      const testId = row.id;
      // 1. Envoyer la commande d'arrêt à Locust
      await axios.get(`${LOCUST_URL}/stop`);
      console.log(`Commande d'arrêt envoyée à Locust pour le test ${testId}.`);
      
      // 2. Arrêter le test en interne
      await stopTestInternal(testId, 'stopped');

      res.json({ success: true, message: 'Test arrêté avec succès.' });
    });

  } catch (error) {
    console.error('Erreur lors de l\'arrêt du test Locust:', error.message);
    res.status(500).json({ success: false, message: 'Erreur communication avec Locust.' });
  }
});


/**
 * Route pour obtenir l'état du test en cours.
 */
app.get('/api/tests/current', (req, res) => {
  db.get("SELECT * FROM tests WHERE status = 'running' ORDER BY start_time DESC LIMIT 1", async (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (row) {
      try {
        const response = await axios.get(`${LOCUST_URL}/stats/requests`);
        res.json({
          running: true,
          testId: row.id,
          name: row.name,
          stats: response.data
        });
      } catch (e) {
        res.json({ running: true, testId: row.id, name: row.name, stats: null });
      }
    } else {
      res.json({ running: false });
    }
  });
});

/**
 * Route pour récupérer l'historique des tests.
 */
app.get('/api/tests/history', (req, res) => {
  db.all("SELECT * FROM tests ORDER BY start_time DESC", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

/**
 * Route pour récupérer les détails d'un test spécifique.
 */
app.get('/api/tests/:testId', (req, res) => {
  const { testId } = req.params;
  db.get("SELECT * FROM tests WHERE id = ?", [testId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: "Test non trouvé" });
    }
    res.json(row);
  });
});


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
//                      DÉMARRAGE DU SERVEUR
// =================================================================

server.listen(API_PORT, () => {
  console.log(`🚀 Serveur API démarré sur http://localhost:${API_PORT}`);
  console.log(`👂 Serveur WebSocket en écoute sur ws://localhost:${WS_PORT}`);
});
