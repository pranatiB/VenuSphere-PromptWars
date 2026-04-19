/**
 * api-client.js (Direct Firestore Fallback)
 * Retains the same API interface but fetches data directly from Firestore
 * so the frontend works without the Google Cloud Function backend.
 */

import { initFirebase, fetchDoc, getIdToken } from '/js/services/firebase-client.js';
import { collection, getDocs, doc, getDoc, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getRecaptchaToken } from '/js/utils/recaptcha.js';

export async function _getCurrentPhase() {
  const sum = await fetchDoc('crowd_summary', 'live');
  return sum ? sum.current_phase : 'pre_event';
}

/* ── Crowd API ── */

export async function getCrowdData() {
  const { db } = initFirebase();
  const phase = await _getCurrentPhase();

  const zonesSnap = await getDocs(collection(db, 'zones'));
  const densitiesSnap = await getDocs(query(collection(db, 'crowd_density'), where('phase', '==', phase)));

  const densitiesMap = {};
  densitiesSnap.forEach(d => { densitiesMap[d.data().zone_id] = d.data().density; });

  const zones = [];
  zonesSnap.forEach(d => {
    const data = d.data();
    const density = densitiesMap[data.id] || 0;

    let label = 'low';
    if (density > 0.8) label = 'critical';
    else if (density > 0.6) label = 'high';
    else if (density > 0.3) label = 'moderate';

    zones.push({
      zone_id: data.id,
      name: data.name,
      density: density,
      label: label,
      trend: 'stable',
      polygon: data.polygon
    });
  });

  return { zones, phase };
}

export async function getZoneCrowd(zoneId) {
  const data = await getCrowdData();
  const zone = data.zones.find(z => z.zone_id === zoneId);
  if (!zone) throw new Error('Zone not found');
  return zone;
}

/* ── Queue API ── */

export async function getQueueData() {
  const { db } = initFirebase();
  const phase = await _getCurrentPhase();

  const stallsSnap = await getDocs(collection(db, 'stalls'));
  const restroomsSnap = await getDocs(collection(db, 'restrooms'));
  const qSnap = await getDocs(query(collection(db, 'queue_times'), where('phase', '==', phase)));

  const qMap = {};
  qSnap.forEach(d => { qMap[d.data().stall_id] = d.data().wait_minutes; });

  const queues = [];

  const processDocs = (snap, type) => {
    snap.forEach(d => {
      const data = d.data();
      const wait = qMap[data.id] || 0;

      let label = 'low';
      if (wait > 20) label = 'critical';
      else if (wait > 10) label = 'high';
      else if (wait > 5) label = 'moderate';

      queues.push({
        stall_id: data.id,
        name: data.name,
        type: type,
        wait_minutes: wait,
        label: label,
        trend: 'stable'
      });
    });
  };

  processDocs(stallsSnap, 'food');
  processDocs(restroomsSnap, 'restroom');

  return { queues, phase };
}

export async function getStallQueue(stallId) {
  const data = await getQueueData();
  const q = data.queues.find(s => s.stall_id === stallId);
  if (!q) throw new Error('Stall not found');
  return q;
}

export async function subscribeQueueAlert(stall_id, threshold_minutes) {
  const token = await getIdToken();
  const res = await fetch(`/api/queue/${stall_id}/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ threshold_minutes })
  });
  if (!res.ok) throw new Error('Subscription failed');
  return res.json();
}

/* ── Chat API ── */

export async function sendChatMessage(message, sessionId) {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const recaptchaToken = await getRecaptchaToken('chat_send');

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Recaptcha-Token': recaptchaToken
    },
    body: JSON.stringify({ message, session_id: sessionId })
  });

  if (!res.ok) {
    throw new Error('Chat API failed');
  }
  return res.json();
}

/* ── Schedule API ── */

export async function getSchedule() {
  const eventDoc = await fetchDoc('event_schedule', 'evt_final_2026');
  const phase = await _getCurrentPhase();
  const alertsData = await getAlerts();

  return {
    schedule: eventDoc || { phases: {} },
    alerts: alertsData.alerts,
    current_phase: phase
  };
}

export async function getAlerts() {
  const { db } = initFirebase();
  const aSnap = await getDocs(collection(db, 'alerts'));
  const alerts = aSnap.docs.map(d => d.data());
  return { alerts, phase: await _getCurrentPhase() };
}

/* ── Check-in API ── */

export async function postCheckIn(zone_id) {
  const token = await getIdToken();
  const res = await fetch('/api/checkin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ zone_id })
  });
  if (!res.ok) throw new Error('Check-in failed');
  return res.json();
}

/* ── Preferences API ── */

export async function getPreferences() {
  const token = await getIdToken();
  const res = await fetch('/api/preferences', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch preferences');
  return res.json();
}

export async function savePreferences(prefs) {
  const token = await getIdToken();
  const res = await fetch('/api/preferences', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(prefs)
  });
  if (!res.ok) throw new Error('Failed to save preferences');
  return res.json();
}

/* ── Navigation API ── */

export async function getRoute(from_zone, to_zone, avoid_crowds = true) {
  const token = await getIdToken();
  const res = await fetch('/api/navigate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ from_zone, to_zone, avoid_crowds })
  });
  if (!res.ok) throw new Error('Navigation API failed');
  return res.json();
}

/* ── Announcements API ── */

export async function getAnnouncements() {
  const { db } = initFirebase();
  const aSnap = await getDocs(collection(db, 'announcements'));
  const announcements = aSnap.docs.map(d => d.data());
  return { announcements };
}

export async function healthCheck() {
  return { status: 'ok' };
}
