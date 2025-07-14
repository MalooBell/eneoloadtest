import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import useCanvasChart from '../hooks/useCanvasChart';

const CanvasAreaChart = ({
  data = [],
  width = 800,
  height = 400,
  margin = { top: 20, right: 30, bottom: 40, left: 50 },
  areas = [],
  colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
  animate = true,
  stacked = false,
  opacity = 0.6,
  strokeWidth = 2,
  className = ''
}) => {
  const tooltipRef = useRef(null);
  const hoverDataRef = useRef(null);
  const lastDataLengthRef = useRef(0);
  const animationFrameRef = useRef(null);

  const {
    canvasRef,
    setupCanvas,
    createScales,
    drawGrid,
    drawAxes,
    animateChart
  } = useCanvasChart({
    data,
    width,
    height,
    margin,
    animate,
    smoothCurve: true
  });

  // Préparation des données pour les aires multiples
  const processedData = useMemo(() => {
    if (!data.length || !areas.length) return [];

    return areas.map((area, index) => ({
      key: area.dataKey,
      name: area.name || area.dataKey,
      color: area.color || colors[index % colors.length],
      stackId: area.stackId || (stacked ? 'default' : index),
      data: data.map(d => ({
        time: d.time,
        value: d[area.dataKey] || 0
      })).filter(d => d.value != null)
    }));
  }, [data, areas, colors, stacked]);

  // Calcul des données empilées si nécessaire
  const stackedData = useMemo(() => {
    if (!stacked || !processedData.length) return processedData;

    // Grouper par stackId
    const stackGroups = d3.group(processedData, d => d.stackId);
    const result = [];

    stackGroups.forEach((group, stackId) => {
      let cumulativeData = new Map();
      
      group.forEach((series, seriesIndex) => {
        const stackedSeries = {
          ...series,
          data: series.data.map(d => {
            const prevValue = cumulativeData.get(d.time) || 0;
            const newValue = prevValue + d.value;
            cumulativeData.set(d.time, newValue);
            
            return {
              time: d.time,
              value: d.value,
              y0: prevValue,
              y1: newValue
            };
          })
        };
        
        result.push(stackedSeries);
      });
    });

    return result;
  }, [processedData, stacked]);

  // Fonction de dessin principal avec rendu incrémental
  const drawChart = useCallback((progress = 1, incremental = false) => {
    const context = setupCanvas();
    if (!context || !stackedData.length) return;

    // Créer les échelles
    const allValues = stacked 
      ? stackedData.flatMap(area => area.data.map(d => d.y1 || d.value))
      : stackedData.flatMap(area => area.data.map(d => d.value));
    const timeValues = data.map(d => d.time);

    if (!timeValues.length || !allValues.length) return;

    // Utiliser scaleLinear pour avoir la méthode invert
    const xScale = d3.scaleLinear()
      .domain([0, timeValues.length - 1])
      .range([0, width - margin.left - margin.right]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allValues) * 1.1])
      .range([height - margin.top - margin.bottom, 0])
      .nice();

    const innerHeight = height - margin.top - margin.bottom;

    // Rendu incrémental ou complet
    if (incremental && lastDataLengthRef.current > 0) {
      // Dessiner seulement les nouveaux segments
      const newPointsStart = lastDataLengthRef.current - 1;
      
      context.save();
      context.translate(margin.left, margin.top);

      stackedData.forEach((areaData, index) => {
        if (!areaData.data.length || areaData.data.length <= newPointsStart) return;

        const newSegmentData = areaData.data.slice(newPointsStart);
        if (newSegmentData.length < 2) return;

        // Dessiner le nouveau segment d'aire
        const gradient = context.createLinearGradient(0, 0, 0, innerHeight);
        gradient.addColorStop(0, areaData.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'));
        gradient.addColorStop(1, areaData.color + '10');

        context.fillStyle = gradient;
        context.strokeStyle = areaData.color;
        context.lineWidth = strokeWidth;

        // Créer le chemin pour le nouveau segment
        context.beginPath();
        newSegmentData.forEach((d, i) => {
          const actualIndex = newPointsStart + i;
          const x = xScale(actualIndex);
          const y0 = stacked ? yScale(d.y0 || 0) : innerHeight;
          const y1 = yScale(stacked ? (d.y1 || d.value) : d.value);
          
          if (i === 0) {
            context.moveTo(x, y0);
            context.lineTo(x, y1);
          } else {
            context.lineTo(x, y1);
          }
        });

        // Fermer le chemin pour l'aire
        for (let i = newSegmentData.length - 1; i >= 0; i--) {
          const actualIndex = newPointsStart + i;
          const x = xScale(actualIndex);
          const y0 = stacked ? yScale(newSegmentData[i].y0 || 0) : innerHeight;
          context.lineTo(x, y0);
        }
        context.closePath();
        context.fill();
        context.stroke();
      });

      context.restore();
    } else {
      // Rendu complet
      context.clearRect(0, 0, width, height);

      // Dessiner la grille
      drawGrid(context, { x: xScale, y: yScale });

      // Dessiner les axes
      drawAxes(context, { x: xScale, y: yScale });

      // Dessiner les aires
      context.save();
      context.translate(margin.left, margin.top);

      stackedData.forEach((areaData, index) => {
        if (!areaData.data.length) return;

        // Calculer les points pour l'animation
        const totalPoints = areaData.data.length;
        const visiblePoints = Math.floor(totalPoints * progress);
        const animatedData = areaData.data.slice(0, visiblePoints);

        if (animatedData.length < 2) return;

        // Créer le générateur d'aire
        const area = d3.area()
          .x((d, i) => xScale(i))
          .y0(d => stacked ? yScale(d.y0 || 0) : innerHeight)
          .y1(d => yScale(stacked ? (d.y1 || d.value) : d.value))
          .curve(d3.curveCardinal.tension(0.3))
          .context(context);

        // Dessiner l'aire avec gradient
        const gradient = context.createLinearGradient(0, 0, 0, innerHeight);
        gradient.addColorStop(0, areaData.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'));
        gradient.addColorStop(1, areaData.color + '10');

        context.fillStyle = gradient;
        context.beginPath();
        area(animatedData);
        context.fill();

        // Dessiner la ligne de contour
        context.strokeStyle = areaData.color;
        context.lineWidth = strokeWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.globalAlpha = 0.8;

        // Ligne supérieure
        const line = d3.line()
          .x((d, i) => xScale(i))
          .y(d => yScale(stacked ? (d.y1 || d.value) : d.value))
          .curve(d3.curveCardinal.tension(0.3))
          .context(context);

        context.beginPath();
        line(animatedData);
        context.stroke();

        context.globalAlpha = 1;
      });

      context.restore();
    }
  }, [setupCanvas, stackedData, width, height, margin, drawGrid, drawAxes, stacked, opacity, strokeWidth, data]);

  // Gestion du survol pour les tooltips - CORRIGÉ avec scaleLinear
  const handleMouseMove = useCallback((event) => {
    if (!canvasRef.current || !stackedData.length) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left - margin.left;

    // Trouver le point le plus proche
    const timeValues = data.map(d => d.time);
    const xScale = d3.scaleLinear()
      .domain([0, timeValues.length - 1])
      .range([0, width - margin.left - margin.right]);

    // Maintenant on peut utiliser invert car c'est scaleLinear
    const mouseIndex = Math.round(xScale.invert(x));
    const closestTimeIndex = Math.max(0, Math.min(mouseIndex, timeValues.length - 1));
    const closestTime = timeValues[closestTimeIndex];

    if (closestTime && tooltipRef.current) {
      const tooltipData = stackedData.map(area => ({
        name: area.name,
        value: data[closestTimeIndex]?.[area.key] || 0,
        color: area.color
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
  }, [canvasRef, stackedData, data, margin, width]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.display = 'none';
    }
    hoverDataRef.current = null;
  }, []);

  // Effet pour redessiner avec rendu incrémental
  useEffect(() => {
    if (stackedData.length > 0) {
      const currentDataLength = data.length;
      const isIncremental = currentDataLength > lastDataLengthRef.current && 
                           lastDataLengthRef.current > 0 && 
                           currentDataLength - lastDataLengthRef.current < 5;
      
      if (isIncremental) {
        // Mise à jour incrémentale
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(() => {
          drawChart(1, true);
        });
      } else {
        // Animation complète
        animateChart(drawChart);
      }
      
      lastDataLengthRef.current = currentDataLength;
    }
  }, [stackedData, animateChart, drawChart, data.length]);

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
      {stackedData.length > 1 && (
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          {stackedData.map((area, index) => (
            <div key={area.key} className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: area.color }}
              />
              <span className="text-gray-700">{area.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CanvasAreaChart;