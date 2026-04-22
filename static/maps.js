/**
 * maps.js — MapLibre GL 4.x
 * Gestão de mapas: inicialização, camadas GeoJSON e popups.
 */

/* ── Tile style (OpenFreeMap, sem token) ─────────────── */
const TILE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/* Cores das camadas */
const LAYER_COLORS = {
  bacia:      '#1565c0',
  trechos:    '#1976d2',
  municipios: '#5c6bc0',
  sedes:      '#7b1fa2',
  acudes:     '#2e7d32',
  gestoras:   '#e65100',
  controle:   '#6d4c41',
  situa:      '#00838f',
};

/* ── Mapa ativo por contentor ────────────────────────── */
const _maps = {};

/** Cria (ou reutiliza) um mapa MapLibre num contentor */
function getOrCreateMap(containerId, opts = {}) {
  if (_maps[containerId]) return _maps[containerId];

  const map = new maplibregl.Map({
    container: containerId,
    style: TILE_STYLE,
    center: opts.center || [-39.5, -5.2],
    zoom: opts.zoom || 8,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  map.addControl(new maplibregl.FullscreenControl(), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  _maps[containerId] = map;
  return map;
}

/** Espera que o mapa esteja carregado e chama callback */
function onMapReady(map, cb) {
  if (map.isStyleLoaded()) { cb(map); return; }
  map.on('load', () => cb(map));
}

/** Remove todas as camadas e fontes com o prefixo dado */
function clearLayers(map, prefix) {
  const layers = map.getStyle()?.layers || [];
  layers.filter(l => l.id.startsWith(prefix)).forEach(l => {
    if (map.getLayer(l.id)) map.removeLayer(l.id);
  });
  const sources = Object.keys(map.getStyle()?.sources || {});
  sources.filter(s => s.startsWith(prefix)).forEach(s => {
    if (map.getSource(s)) map.removeSource(s);
  });
}

/** Cria popup HTML para reservatório (açudes) */
function popupAcude(props) {
  const pct = props.Percentual != null ? `${Number(props.Percentual).toFixed(2)}%` : 'N/A';
  const vol = props.Volume     != null ? `${Number(props.Volume).toFixed(2)} hm³` : 'N/A';
  const cota = props['Cota Sangria'] != null ? `${Number(props['Cota Sangria']).toFixed(2)} m` : 'N/A';
  return `<div class="map-popup">
    <div class="map-popup-title">${props.Reservatório || props.Name || '—'}</div>
    <div class="map-popup-row"><span class="map-popup-label">Município:</span><span class="map-popup-value">${props.Município || 'N/A'}</span></div>
    <div class="map-popup-row"><span class="map-popup-label">Volume:</span><span class="map-popup-value">${vol}</span></div>
    <div class="map-popup-row"><span class="map-popup-label">Percentual:</span><span class="map-popup-value">${pct}</span></div>
    <div class="map-popup-row"><span class="map-popup-label">Cota Sangria:</span><span class="map-popup-value">${cota}</span></div>
  </div>`;
}

/** Cria popup HTML para gestoras */
function popupGestora(props) {
  return `<div class="map-popup">
    <div class="map-popup-title">${props.SISTEMAH3 || '—'}</div>
    <div class="map-popup-row"><span class="map-popup-label">Município:</span><span class="map-popup-value">${props.MUNICIPI6 || 'N/A'}</span></div>
    <div class="map-popup-row"><span class="map-popup-label">Ano Formação:</span><span class="map-popup-value">${props.ANOFORMA1 || 'N/A'}</span></div>
  </div>`;
}

/** Popup para representante do comitê */
function popupComite(props) {
  return `<div class="map-popup">
    <div class="map-popup-title">${props['Nome do(a) representante'] || '—'}</div>
    <div class="map-popup-row"><span class="map-popup-label">Sigla:</span><span class="map-popup-value">${props.Sigla || props.Instituição || 'N/A'}</span></div>
    <div class="map-popup-row"><span class="map-popup-label">Segmento:</span><span class="map-popup-value">${props.Segmento || 'N/A'}</span></div>
    <div class="map-popup-row"><span class="map-popup-label">Função:</span><span class="map-popup-value">${props.Função || 'N/A'}</span></div>
    <div class="map-popup-row"><span class="map-popup-label">Município:</span><span class="map-popup-value">${props.Município || 'N/A'}</span></div>
  </div>`;
}

/** Cor de preenchimento do marcador por percentual */
function colorByPerc(pct) {
  if (pct == null || isNaN(pct)) return '#808080';
  if (pct <= 10)  return '#808080';
  if (pct <= 30)  return '#ef5350';
  if (pct <= 50)  return '#fdd835';
  if (pct <= 70)  return '#43a047';
  if (pct <= 100) return '#1976d2';
  return '#9c27b0'; // vertendo
}

/** Adiciona popup num layer do mapa */
function addPopupOnClick(map, layerId, popupFn) {
  map.on('click', layerId, (e) => {
    const props = e.features[0].properties;
    const coords = e.lngLat;
    new maplibregl.Popup({ offset: 12 })
      .setLngLat(coords)
      .setHTML(popupFn(props))
      .addTo(map);
  });
  map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
}

/* ═══════════════════════════════════════════════════════
   MAPA DO PAINEL DE VAZÕES
   ═══════════════════════════════════════════════════════ */
async function initMapPainel(rows) {
  const map = getOrCreateMap('map-painel', { center: [-39.5, -5.2], zoom: 8 });
  onMapReady(map, async (m) => {
    clearLayers(m, 'painel-');

    /* Camada bacia */
    const bacia = await fetchGeoJSON('bacia');
    if (bacia) {
      m.addSource('painel-bacia', { type: 'geojson', data: bacia });
      m.addLayer({ id: 'painel-bacia-line', type: 'line', source: 'painel-bacia',
        paint: { 'line-color': LAYER_COLORS.bacia, 'line-width': 2, 'line-opacity': .8 } });
    }

    /* Trechos perenizados */
    const trechos = await fetchGeoJSON('trechos');
    if (trechos) {
      m.addSource('painel-trechos', { type: 'geojson', data: trechos });
      m.addLayer({ id: 'painel-trechos-line', type: 'line', source: 'painel-trechos',
        paint: { 'line-color': '#1e88e5', 'line-width': 1.2 } });
    }

    /* Pontos: reservatórios filtrados */
    if (rows && rows.length > 0) {
      const fcReservatorios = buildFeatureCollectionFromRows(rows);
      if (fcReservatorios) {
        m.addSource('painel-reservatorios', { type: 'geojson', data: fcReservatorios });
        m.addLayer({
          id: 'painel-res-circle', type: 'circle', source: 'painel-reservatorios',
          paint: {
            'circle-radius': 9,
            'circle-color': '#1976d2',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          }
        });
        m.addLayer({
          id: 'painel-res-label', type: 'symbol', source: 'painel-reservatorios',
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 11,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
          },
          paint: { 'text-color': '#1a2232', 'text-halo-color': '#fff', 'text-halo-width': 1.5 }
        });
        addPopupOnClick(m, 'painel-res-circle', (p) => `<div class="map-popup">
          <div class="map-popup-title">${p.label || '—'}</div>
          <div class="map-popup-row"><span class="map-popup-label">Vazão:</span><span class="map-popup-value">${p.vazao != null ? Number(p.vazao).toFixed(3) + ' L/s' : '—'}</span></div>
          <div class="map-popup-row"><span class="map-popup-label">Data:</span><span class="map-popup-value">${p.data || '—'}</span></div>
        </div>`);

        /* Fit bounds */
        const coords = fcReservatorios.features.map(f => f.geometry.coordinates);
        if (coords.length > 0) fitMapToCoords(m, coords);
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════
   MAPA DOS AÇUDES
   ═══════════════════════════════════════════════════════ */
async function initMapAcudes(rows) {
  const map = getOrCreateMap('map-acudes', { center: [-39.5, -5.2], zoom: 8 });
  onMapReady(map, async (m) => {
    clearLayers(m, 'acudes-');

    const bacia = await fetchGeoJSON('bacia');
    if (bacia) {
      m.addSource('acudes-bacia', { type: 'geojson', data: bacia });
      m.addLayer({ id: 'acudes-bacia-fill', type: 'fill', source: 'acudes-bacia',
        paint: { 'fill-color': '#e3f2fd', 'fill-opacity': .35 } });
      m.addLayer({ id: 'acudes-bacia-line', type: 'line', source: 'acudes-bacia',
        paint: { 'line-color': LAYER_COLORS.bacia, 'line-width': 1.8 } });
    }

    const munic = await fetchGeoJSON('municipios');
    if (munic) {
      m.addSource('acudes-munic', { type: 'geojson', data: munic });
      m.addLayer({ id: 'acudes-munic-line', type: 'line', source: 'acudes-munic',
        paint: { 'line-color': '#5c6bc0', 'line-width': .8, 'line-dasharray': [3, 3] } });
    }

    if (rows && rows.length > 0) {
      /* deduplica por reservatório */
      const seen = new Set();
      const dedup = rows.filter(r => {
        if (seen.has(r.Reservatório)) return false;
        seen.add(r.Reservatório); return true;
      });

      const features = dedup
        .filter(r => r.Latitude != null && r.Longitude != null)
        .map(r => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.Longitude, r.Latitude] },
          properties: { ...r, _color: colorByPerc(r.Percentual) },
        }));

      if (features.length > 0) {
        const fc = { type: 'FeatureCollection', features };
        m.addSource('acudes-pts', { type: 'geojson', data: fc });
        m.addLayer({
          id: 'acudes-circle', type: 'circle', source: 'acudes-pts',
          paint: {
            'circle-radius': 10,
            'circle-color': ['get', '_color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          }
        });
        addPopupOnClick(m, 'acudes-circle', popupAcude);
        fitMapToCoords(m, features.map(f => f.geometry.coordinates));
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════
   MAPA SEDES MUNICIPAIS
   ═══════════════════════════════════════════════════════ */
async function initMapSedes(rows) {
  const map = getOrCreateMap('map-sedes', { center: [-39.5, -5.2], zoom: 8 });
  onMapReady(map, async (m) => {
    clearLayers(m, 'sedes-');

    const bacia = await fetchGeoJSON('bacia');
    if (bacia) {
      m.addSource('sedes-bacia', { type: 'geojson', data: bacia });
      m.addLayer({ id: 'sedes-bacia-fill', type: 'fill', source: 'sedes-bacia',
        paint: { 'fill-color': '#e8f5e9', 'fill-opacity': .3 } });
      m.addLayer({ id: 'sedes-bacia-line', type: 'line', source: 'sedes-bacia',
        paint: { 'line-color': '#1565c0', 'line-width': 1.8 } });
    }

    const sedesGeo = await fetchGeoJSON('sedes');
    if (sedesGeo) {
      m.addSource('sedes-geo', { type: 'geojson', data: sedesGeo });
      m.addLayer({
        id: 'sedes-circle', type: 'circle', source: 'sedes-geo',
        paint: { 'circle-radius': 7, 'circle-color': '#7b1fa2', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' }
      });
      addPopupOnClick(m, 'sedes-circle', (p) => `<div class="map-popup">
        <div class="map-popup-title">${p.NOME_MUNIC || '—'}</div>
      </div>`);
    }

    /* Camada de situação se disponível */
    const situa = await fetchGeoJSON('situa');
    if (situa) {
      m.addSource('sedes-situa', { type: 'geojson', data: situa });
      m.addLayer({ id: 'sedes-situa-fill', type: 'fill', source: 'sedes-situa',
        paint: { 'fill-color': '#43a047', 'fill-opacity': .25 } });
      m.addLayer({ id: 'sedes-situa-line', type: 'line', source: 'sedes-situa',
        paint: { 'line-color': '#2e7d32', 'line-width': 1 } });
    }
  });
}

/* ═══════════════════════════════════════════════════════
   MAPA DO COMITÊ
   ═══════════════════════════════════════════════════════ */
const SEGMENT_COLORS = [
  '#e53935','#8e24aa','#1e88e5','#43a047','#fb8c00',
  '#6d4c41','#00acc1','#e91e63','#3949ab','#00897b',
];

async function initMapComite(rows) {
  const map = getOrCreateMap('map-comite', { center: [-39.5, -5.5], zoom: 7 });
  onMapReady(map, async (m) => {
    clearLayers(m, 'comite-');

    const bacia = await fetchGeoJSON('bacia');
    if (bacia) {
      m.addSource('comite-bacia', { type: 'geojson', data: bacia });
      m.addLayer({ id: 'comite-bacia-line', type: 'line', source: 'comite-bacia',
        paint: { 'line-color': '#1565c0', 'line-width': 1.5, 'line-dasharray': [4, 2] } });
    }

    if (!rows || rows.length === 0) return;

    const segments = [...new Set(rows.map(r => r.Segmento).filter(Boolean))];
    const segColorMap = Object.fromEntries(segments.map((s, i) => [s, SEGMENT_COLORS[i % SEGMENT_COLORS.length]]));

    const features = rows
      .filter(r => r.Latitude != null && r.Longitude != null &&
                   !isNaN(Number(r.Latitude)) && !isNaN(Number(r.Longitude)))
      .map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(r.Longitude), Number(r.Latitude)] },
        properties: {
          ...r,
          _color: segColorMap[r.Segmento] || '#9e9e9e',
        },
      }));

    if (features.length === 0) return;

    const fc = { type: 'FeatureCollection', features };
    m.addSource('comite-pts', { type: 'geojson', data: fc });
    m.addLayer({
      id: 'comite-circle', type: 'circle', source: 'comite-pts',
      paint: {
        'circle-radius': 9,
        'circle-color': ['get', '_color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      }
    });
    addPopupOnClick(m, 'comite-circle', popupComite);
    fitMapToCoords(m, features.map(f => f.geometry.coordinates));

    /* Legend */
    const legendEl = document.getElementById('acudes-legend');
    if (legendEl) {
      legendEl.innerHTML = segments.map(s =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${segColorMap[s]}"></span>${s}</span>`
      ).join('');
    }
  });
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

const _geojsonCache = {};
async function fetchGeoJSON(layer) {
  if (_geojsonCache[layer]) return _geojsonCache[layer];
  try {
    const res = await fetch(`/api/geojson/${layer}`);
    if (!res.ok) return null;
    const data = await res.json();
    _geojsonCache[layer] = data;
    return data;
  } catch { return null; }
}

function fitMapToCoords(map, coords) {
  if (!coords || coords.length === 0) return;
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const pad = { padding: 60 };
  try {
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      pad
    );
  } catch { /* ignore */ }
}

function buildFeatureCollectionFromRows(rows) {
  const features = rows
    .filter(r => r.lat != null && r.lon != null)
    .map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: {
        label: r['Reservatório Monitorado'] || r.Reservatório || '—',
        vazao: r['Vazão Operada'],
        data: r.Data,
      },
    }));
  if (features.length === 0) return null;
  return { type: 'FeatureCollection', features };
}
