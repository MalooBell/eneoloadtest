import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import useCanvasChart from '../hooks/useCanvasChart';
import * as d3 from 'd3';

const CanvasLineChart = ({
  data = [],
  width = 800,
  height = 400,
  margin = { top: 20, right: 30, bottom: 40, left: 50 },
  lines = [],
  colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
  animate = true,
  showPoints = false,
  strokeWidth = 2,
  className = ''
}) => {
  const tooltipRef = useRef(null);
  const hoverDataRef = useRef(null);
  const lastDataLengthRef = useRef(0);
  const animationFrameRef = useRef(null);
  const previousPathsRef = useRef([]);

  const {
    canvasRef,
    setupCanvas,
    createScales,
    drawGrid,
    drawAxes,
    createLineGenerator,
    animateChart
  } = useCanvasChart({
    data,
    width,
    height,
    margin,
    animate,
    smoothCurve: true
  });

  // Préparation des données pour les lignes multiples
  const processedData = useMemo(() => {
    if (!data.length || !lines.length) return [];

    return lines.map((line, index) => ({
      key: line.dataKey,
      name: line.name || line.dataKey,
      color: line.color || colors[index % colors.length],
      data: data.map(d => ({
        time: d.time,
        value: d[line.dataKey] || 0
      })).filter(d => d.value != null)
    }));
  }, [data, lines, colors]);

  // Fonction de dessin optimisée pour la fluidité avec rendu incrémental
  const drawChart = useCallback((progress = 1, incremental = false) => {
    const context = setupCanvas();
    if (!context || !processedData.length) return;

    // Créer les échelles basées sur toutes les données
    const allValues = processedData.flatMap(line => line.data.map(d => d.value));
    const timeValues = data.map(d => d.time);

    if (!timeValues.length || !allValues.length) return;

    // Utiliser scaleLinear pour avoir la méthode invert
    const xScale = d3.scaleLinear()
      .domain([0, timeValues.length - 1])
      .range([0, width - margin.left - margin.right]);

    const yScale = d3.scaleLinear()
      .domain([Math.min(0, d3.min(allValues)), d3.max(allValues) * 1.1])
      .range([height - margin.top - margin.bottom, 0])
      .nice();

    // Pour le rendu incrémental, on ne redessine que les nouveaux points
    if (incremental && lastDataLengthRef.current > 0) {
      // Dessiner seulement les nouveaux segments
      const newPointsStart = lastDataLengthRef.current - 1;
      
      context.save();
      context.translate(margin.left, margin.top);

      processedData.forEach((lineData, index) => {
        if (!lineData.data.length || lineData.data.length <= newPointsStart) return;

        const newSegmentData = lineData.data.slice(newPointsStart);
        if (newSegmentData.length < 2) return;

        // Configuration du style
        context.strokeStyle = lineData.color;
        context.lineWidth = strokeWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.shadowColor = lineData.color;
        context.shadowBlur = 2;
        context.globalAlpha = 0.8;

        // Dessiner le nouveau segment
        context.beginPath();
        newSegmentData.forEach((d, i) => {
          const actualIndex = newPointsStart + i;
          const x = xScale(actualIndex);
          const y = yScale(d.value);
          
          if (i === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        });
        context.stroke();

        // Dessiner les nouveaux points si demandé
        if (showPoints) {
          context.fillStyle = lineData.color;
          context.shadowBlur = 0;
          newSegmentData.forEach((d, i) => {
            const actualIndex = newPointsStart + i;
            const x = xScale(actualIndex);
            const y = yScale(d.value);
            
            context.beginPath();
            context.arc(x, y, 3, 0, 2 * Math.PI);
            context.fill();
          });
        }

        context.shadowBlur = 0;
        context.globalAlpha = 1;
      });

      context.restore();
    } else {
      // Rendu complet
      context.clearRect(0, 0, width, height);

      // Dessiner la grille et les axes
      drawGrid(context, { x: xScale, y: yScale });
      drawAxes(context, { x: xScale, y: yScale });

      // Dessiner les lignes
      context.save();
      context.translate(margin.left, margin.top);

      processedData.forEach((lineData, index) => {
        if (!lineData.data.length) return;

        // Calculer les points pour l'animation
        const totalPoints = lineData.data.length;
        const visiblePoints = Math.floor(totalPoints * progress);
        const animatedData = lineData.data.slice(0, visiblePoints);

        if (animatedData.length < 2) return;

        // Configuration du style
        context.strokeStyle = lineData.color;
        context.lineWidth = strokeWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.shadowColor = lineData.color;
        context.shadowBlur = 3;
        context.globalAlpha = 0.8;

        // Générer le chemin de la ligne avec courbe lisse
        context.beginPath();
        
        const line = d3.line()
          .x((d, i) => xScale(i))
          .y(d => yScale(d.value))
          .curve(d3.curveCardinal.tension(0.3))
          .context(context);

        line(animatedData);
        context.stroke();

        // Réinitialiser les effets
        context.shadowBlur = 0;
        context.globalAlpha = 1;

        // Dessiner les points si demandé
        if (showPoints) {
          context.fillStyle = lineData.color;
          animatedData.forEach((d, i) => {
            const x = xScale(i);
            const y = yScale(d.value);
            
            context.beginPath();
            context.arc(x, y, 3, 0, 2 * Math.PI);
            context.fill();
            
            // Halo autour du point
            context.beginPath();
            context.arc(x, y, 6, 0, 2 * Math.PI);
            context.strokeStyle = lineData.color;
            context.lineWidth = 1;
            context.globalAlpha = 0.3;
            context.stroke();
            context.globalAlpha = 1;
          });
        }
      });

      context.restore();
    }
  }, [setupCanvas, processedData, width, height, margin, drawGrid, drawAxes, strokeWidth, showPoints, data]);

  // Gestion du survol pour les tooltips - CORRIGÉ avec scaleLinear
  const handleMouseMove = useCallback((event) => {
    if (!canvasRef.current || !processedData.length) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left - margin.left;

    // Trouver le point le plus proche avec échelle linéaire
    const timeValues = data.map(d => d.time);
    const xScale = d3.scaleLinear()
      .domain([0, timeValues.length - 1])
      .range([0, width - margin.left - margin.right]);

    // Maintenant on peut utiliser invert car c'est scaleLinear
    const mouseIndex = Math.round(xScale.invert(x));
    const closestTimeIndex = Math.max(0, Math.min(mouseIndex, timeValues.length - 1));
    const closestTime = timeValues[closestTimeIndex];

    if (closestTime && tooltipRef.current) {
      const tooltipData = processedData.map(line => ({
        name: line.name,
        value: data[closestTimeIndex]?.[line.key] || 0,
        color: line.color
      }));

      hoverDataRef.current = { time: closestTime, data: tooltipData, x: event.clientX, y: event.clientY };
      
      // Afficher le tooltip
      tooltipRef.current.style.display = 'block';
      tooltipRef.current.style.left = `${event.clientX + 10}px`;
      tooltipRef.current.style.top = `${event.clientY - 10}px`;
      tooltipRef.current.innerHTML = `
        <div class="bg-white p-2 border border-gray-200 rounded shadow-lg text-sm">
          <div class="font-medium">${closestTime}</div>
          ${tooltipData.map(item => `
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 rounded-full" style="background-color: ${item.color}"></div>
              <span>${item.name}: ${item.value}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  }, [canvasRef, processedData, data, margin, width]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.display = 'none';
    }
    hoverDataRef.current = null;
  }, []);

  // Effet pour redessiner de manière fluide avec rendu incrémental
  useEffect(() => {
    if (processedData.length > 0) {
      const currentDataLength = data.length;
      const isIncremental = currentDataLength > lastDataLengthRef.current && 
                           lastDataLengthRef.current > 0 && 
                           currentDataLength - lastDataLengthRef.current < 5; // Seulement pour de petits ajouts
      
      if (isIncremental) {
        // Mise à jour incrémentale pour plus de fluidité
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(() => {
          drawChart(1, true); // Rendu incrémental
        });
      } else {
        // Première fois ou changement majeur - animation complète
        animateChart(drawChart);
      }
      
      lastDataLengthRef.current = currentDataLength;
    }
  }, [processedData, animateChart, drawChart, data.length]);

  // Nettoyage
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="cursor-crosshair"
        style={{ width, height }}
      />
      
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none z-50"
        style={{ display: 'none' }}
      />
      
      {/* Légende */}
      {processedData.length > 1 && (
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          {processedData.map((line, index) => (
            <div key={line.key} className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: line.color }}
              />
              <span className="text-gray-700">{line.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CanvasLineChart;