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

  // Préparation des données pour les aires multiples avec échelle temporelle
  const processedData = useMemo(() => {
    if (!data.length || !areas.length) return [];

    // Convertir les timestamps en objets Date
    const dataWithDates = data.map(d => ({
      ...d,
      timestamp: new Date(`2024-01-01 ${d.time}`)
    }));

    return areas.map((area, index) => ({
      key: area.dataKey,
      name: area.name || area.dataKey,
      color: area.color || colors[index % colors.length],
      stackId: area.stackId || (stacked ? 'default' : index),
      data: dataWithDates.map(d => ({
        time: d.time,
        timestamp: d.timestamp,
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
              timestamp: d.timestamp,
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

  // Fonction de dessin principal avec échelle temporelle
  const drawChart = useCallback((progress = 1, incremental = false) => {
    const context = setupCanvas();
    if (!context || !stackedData.length) return;

    // Créer les échelles temporelles
    const allValues = stacked 
      ? stackedData.flatMap(area => area.data.map(d => d.y1 || d.value))
      : stackedData.flatMap(area => area.data.map(d => d.value));
    const allTimestamps = stackedData[0]?.data.map(d => d.timestamp) || [];

    if (!allTimestamps.length || !allValues.length) return;

    // Échelle temporelle pour l'axe X
    const xScale = d3.scaleTime()
      .domain(d3.extent(allTimestamps))
      .range([0, width - margin.left - margin.right]);

    // Échelle linéaire pour l'axe Y
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allValues) * 1.1])
      .range([height - margin.top - margin.bottom, 0])
      .nice();

    const innerHeight = height - margin.top - margin.bottom;

    // Rendu incrémental ou complet
    if (incremental && lastDataLengthRef.current > 0) {
      const newPointsStart = lastDataLengthRef.current - 1;
      
      context.save();
      context.translate(margin.left, margin.top);

      stackedData.forEach((areaData, index) => {
        if (!areaData.data.length || areaData.data.length <= newPointsStart) return;

        const newSegmentData = areaData.data.slice(newPointsStart);
        if (newSegmentData.length < 2) return;

        // Dessiner le nouveau segment d'aire avec échelle temporelle
        const gradient = context.createLinearGradient(0, 0, 0, innerHeight);
        gradient.addColorStop(0, areaData.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'));
        gradient.addColorStop(1, areaData.color + '10');

        context.fillStyle = gradient;
        context.strokeStyle = areaData.color;
        context.lineWidth = strokeWidth;

        // Créer le chemin pour le nouveau segment avec échelle temporelle
        context.beginPath();
        newSegmentData.forEach((d, i) => {
          const x = xScale(d.timestamp);
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
          const x = xScale(newSegmentData[i].timestamp);
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

      // Dessiner les axes avec formatage temporel
      drawAxesWithTimeFormat(context, xScale, yScale);

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

        // Créer le générateur d'aire avec échelle temporelle
        const area = d3.area()
          .x(d => xScale(d.timestamp))
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

        // Ligne supérieure avec échelle temporelle
        const line = d3.line()
          .x(d => xScale(d.timestamp))
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
  }, [setupCanvas, stackedData, width, height, margin, drawGrid, stacked, opacity, strokeWidth]);

  // Fonction pour dessiner les axes avec formatage temporel
  const drawAxesWithTimeFormat = useCallback((context, xScale, yScale) => {
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    context.save();
    context.translate(margin.left, margin.top);
    context.strokeStyle = '#374151';
    context.fillStyle = '#374151';
    context.font = '12px Inter, sans-serif';
    context.lineWidth = 1;

    // Axe X avec formatage temporel
    context.beginPath();
    context.moveTo(0, innerHeight);
    context.lineTo(innerWidth, innerHeight);
    context.stroke();

    // Labels axe X avec formatage temporel
    const xTicks = xScale.ticks(6);
    const timeFormat = d3.timeFormat('%H:%M:%S');
    context.textAlign = 'center';
    context.textBaseline = 'top';
    xTicks.forEach(tick => {
      const x = xScale(tick);
      context.fillText(timeFormat(tick), x, innerHeight + 10);
    });

    // Axe Y
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, innerHeight);
    context.stroke();

    // Labels axe Y
    const yTicks = yScale.ticks(6);
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    yTicks.forEach(tick => {
      const y = yScale(tick);
      context.fillText(tick.toString(), -10, y);
    });

    context.restore();
  }, [width, height, margin]);

  // Gestion du survol pour les tooltips avec échelle temporelle
  const handleMouseMove = useCallback((event) => {
    if (!canvasRef.current || !stackedData.length) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left - margin.left;

    // Trouver le point le plus proche avec échelle temporelle
    const allTimestamps = stackedData[0]?.data.map(d => d.timestamp) || [];
    if (!allTimestamps.length) return;

    const xScale = d3.scaleTime()
      .domain(d3.extent(allTimestamps))
      .range([0, width - margin.left - margin.right]);

    // Utiliser invert pour trouver le timestamp le plus proche
    const mouseTime = xScale.invert(x);
    
    // Trouver l'index du point le plus proche
    let closestIndex = 0;
    let minDistance = Math.abs(allTimestamps[0] - mouseTime);
    
    for (let i = 1; i < allTimestamps.length; i++) {
      const distance = Math.abs(allTimestamps[i] - mouseTime);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    const closestTime = stackedData[0].data[closestIndex]?.time;

    if (closestTime && tooltipRef.current) {
      const tooltipData = stackedData.map(area => ({
        name: area.name,
        value: area.data[closestIndex]?.value || 0,
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
              <span>${item.name}: ${typeof item.value === 'number' ? item.value.toFixed(1) : item.value}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  }, [canvasRef, stackedData, margin, width]);

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