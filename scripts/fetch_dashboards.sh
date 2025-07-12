#!/usr/bin/env bash
set -e

# Définit le dossier de destination
DASHBOARD_DIR="./grafana/provisioning/dashboards"

# Crée le dossier s'il n'existe pas
mkdir -p "$DASHBOARD_DIR"

for id in 20462 12081 1860 14574; do
  echo "Téléchargement dashboard $id"
  # Télécharge les fichiers directement dans le bon dossier
  curl -sL "https://grafana.com/api/dashboards/${id}/revisions/1/download" \
       -o "${DASHBOARD_DIR}/${id}.json"
done

echo "Dashboards importés dans ${DASHBOARD_DIR}."
