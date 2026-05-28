const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

export const DATA_SOURCE = 'assigned_pokemon_csv';
export const ENGINE_NAME = 'Battle Predictor Engine';
export const GROUP_NAME = 'Engine 3';
export const SECTION_PREDICTION = 'prediction';
export const SECTION_GROUND_TRUTH = 'ground_truth';

export function isBackendConfigured() {
  return Boolean(DEFAULT_API_BASE_URL);
}

function apiUrl(path) {
  return `${DEFAULT_API_BASE_URL}${path}`;
}

async function request(path, options = {}) {
  if (!isBackendConfigured()) {
    throw new Error('Backend not configured');
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function loadBattles() {
  return request('/api/predictions');
}

export async function savePrediction(payload) {
  return request('/api/predictions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveGroundTruth(payload) {
  if (payload.screenshot_file instanceof File) {
    const formData = new FormData();

    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'screenshot_file') {
        return;
      }

      if (value !== null && value !== undefined && value !== '') {
        formData.append(key, value);
      }
    });

    formData.append('screenshot_file', payload.screenshot_file);

    return request('/api/ground-truth', {
      method: 'POST',
      body: formData,
    });
  }

  return request('/api/ground-truth', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function nextMatchId(battles) {
  const highest = battles.reduce((max, battle) => {
    const value = Number.parseInt(String(battle.id ?? battle.match_id ?? 0), 10);
    return Number.isNaN(value) ? max : Math.max(max, value);
  }, 0);

  return String(highest + 1).padStart(3, '0');
}

export function toDisplayBattle(record) {
  return {
    id: String(record.id ?? record.match_id ?? ''),
    battlerA: record.battlerA ?? record.battler_a ?? '',
    battlerB: record.battlerB ?? record.battler_b ?? '',
    predictedWinner: record.predictedWinner ?? record.predicted_winner ?? '',
    confidence: Number(record.confidence ?? record.confidence_score ?? 0),
    reason: record.reason ?? record.prediction_reason ?? '',
    model: record.model ?? record.model_used ?? '',
    timestamp: record.timestamp ?? '',
    actualWinner: record.actualWinner ?? record.actual_winner ?? null,
    turns: record.turns ?? record.number_of_turns ?? null,
    finalScore: record.finalScore ?? record.final_score ?? '',
    mvp: record.mvp ?? record.mvp_pokemon ?? '',
    replayLink: record.replayLink ?? record.replay_link ?? '',
    screenshotPreview: record.screenshotPreview ?? record.screenshot_or_photo_link ?? '',
    screenshotName: record.screenshotName ?? record.screenshot_filename ?? '',
    correctPrediction:
      record.correctPrediction ?? record.correct_prediction ?? record.correct_or_incorrect ?? null,
  };
}

export function toPredictionPayload({ form, matchId, timestamp }) {
  return {
    engine_name: ENGINE_NAME,
    group_name: GROUP_NAME,
    section: SECTION_PREDICTION,
    input_data_source: DATA_SOURCE,
    match_id: matchId,
    battler_a: form.battlerA.trim(),
    battler_b: form.battlerB.trim(),
    predicted_winner:
      form.predictedWinnerSide === 'A' ? form.battlerA.trim() : form.battlerB.trim(),
    confidence_score: Number(form.confidence) / 100,
    prediction_reason: form.reason.trim(),
    model_used: form.model,
    timestamp,
  };
}

export function toGroundTruthPayload({ form, battle, screenshotUrl = '', screenshotName = '' }) {
  const correctPrediction = battle
    ? battle.predictedWinner === form.actualWinner
    : null;

  return {
    engine_name: ENGINE_NAME,
    group_name: GROUP_NAME,
    section: SECTION_GROUND_TRUTH,
    input_data_source: DATA_SOURCE,
    match_id: form.matchId,
    actual_winner: form.actualWinner,
    correct_prediction: correctPrediction,
    replay_link: form.replayLink.trim(),
    screenshot_or_photo_link: screenshotUrl,
    screenshot_filename: screenshotName,
    final_score: form.finalScore.trim(),
    number_of_turns: form.turns ? Number(form.turns) : null,
    mvp_pokemon: form.mvp.trim(),
    timestamp: new Date().toISOString(),
  };
}
