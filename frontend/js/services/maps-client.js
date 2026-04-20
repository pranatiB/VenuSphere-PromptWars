/**
 * maps-client.js
 * Lazy Google Maps loader, zone polygon renderer, and directions renderer.
 * Maps API is only loaded when the map view is opened.
 */

const MAPS_CDN = 'https://maps.googleapis.com/maps/api/js';
/** Replace with your Google Maps API key. */
const MAPS_API_KEY = window.VENUSPHERE_MAPS_KEY || 'REPLACE_MAPS_API_KEY';

let _mapsLoaded = false;
let _loadPromise = null;

/** Density to hex color map. */
const DENSITY_COLORS = {
  low: { fill: '#06d6a0', stroke: '#04b886' },
  moderate: { fill: '#ffd166', stroke: '#e6bb59' },
  high: { fill: '#f77f00', stroke: '#d96e00' },
  critical: { fill: '#ef476f', stroke: '#d63d62' },
  unknown: { fill: '#6b7280', stroke: '#5a6270' },
};

/** @type {google.maps.Map | null} */
let _map = null;
/** @type {Map<string, google.maps.Polygon>} */
const _polygons = new Map();
/** @type {google.maps.DirectionsRenderer | null} */
let _directionsRenderer = null;

/**
 * Lazy-load the Google Maps JS API once.
 * @returns {Promise<void>}
 */
export function loadGoogleMaps() {
  if (_mapsLoaded) return Promise.resolve();
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise((resolve, reject) => {
    if (!MAPS_API_KEY || MAPS_API_KEY.startsWith('REPLACE')) {
      reject(new Error('Google Maps API key not configured'));
      return;
    }
    const script = document.createElement('script');
    script.src = `${MAPS_CDN}?key=${MAPS_API_KEY}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => { _mapsLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return _loadPromise;
}

/**
 * Initialize a Google Map centred on the venue.
 * @param {string} containerId - ID of the div to render the map in.
 * @param {{ lat: number, lng: number }} center
 * @param {number} [zoom=17]
 * @returns {google.maps.Map}
 */
export function initMap(containerId, center, zoom = 17) {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Map container #${containerId} not found`);

  _map = new google.maps.Map(container, {
    center,
    zoom,
    mapTypeId: 'satellite',
    tilt: 0,
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    styles: _darkMapStyles(),
  });

  return _map;
}

/**
 * Add a zone polygon overlay to the map.
 * @param {google.maps.Map} map
 * @param {{ id: string, name: string, polygon: Array<{lat:number,lng:number}>, density?: number, label?: string }} zone
 * @param {(zone: Object) => void} onClickCallback
 */
export function addZonePolygon(map, zone, onClickCallback) {
  const label = zone.label || 'unknown';
  const colors = DENSITY_COLORS[label] || DENSITY_COLORS.unknown;

  const poly = new google.maps.Polygon({
    paths: zone.polygon,
    strokeColor: colors.stroke,
    strokeOpacity: 0.9,
    strokeWeight: 2,
    fillColor: colors.fill,
    fillOpacity: 0.45,
    map,
  });

  poly.addListener('click', () => onClickCallback(zone));
  _polygons.set(zone.id, poly);
}

/**
 * Update an existing polygon's color based on new density.
 * @param {string} zoneId
 * @param {string} label - 'low' | 'moderate' | 'high' | 'critical'
 */
export function updateZoneColor(zoneId, label) {
  const poly = _polygons.get(zoneId);
  if (!poly) return;
  const colors = DENSITY_COLORS[label] || DENSITY_COLORS.unknown;
  poly.setOptions({ fillColor: colors.fill, strokeColor: colors.stroke });
}

/**
 * Render a walking route between two coordinates using Directions API.
 * @param {google.maps.Map} map
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distance: string, duration: string }>}
 */
export function renderRoute(map, origin, destination) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.DirectionsService();

    if (!_directionsRenderer) {
      _directionsRenderer = new google.maps.DirectionsRenderer({
        polylineOptions: { strokeColor: '#4361ee', strokeWeight: 4, strokeOpacity: 0.85 },
        suppressMarkers: false,
      });
    }
    _directionsRenderer.setMap(map);

    service.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.WALKING,
      },
      (result, status) => {
        if (status === 'OK') {
          _directionsRenderer.setDirections(result);
          const leg = result.routes[0].legs[0];
          resolve({ distance: leg.distance.text, duration: leg.duration.text });
        } else {
          reject(new Error(`Directions API error: ${status}`));
        }
      }
    );
  });
}

/** Clear rendered route from the map. */
export function clearRoute() {
  if (_directionsRenderer) _directionsRenderer.setMap(null);
}

/**
 * Returns dark-mode map styles compatible with the VenuSphere design system.
 * @returns {Array<google.maps.MapTypeStyle>}
 */
function _darkMapStyles() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f23' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#16213e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d1b2a' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
  ];
}
