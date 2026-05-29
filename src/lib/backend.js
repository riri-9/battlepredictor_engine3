import { isSupabaseConfigured, supabase } from './supabaseClient';
import { safeBuildBattlePrediction, parseBattleLineup } from './pokemonData';

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

export const DATA_SOURCE = 'pokeapi_cached_csv';
export const ENGINE_NAME = 'Battle Predictor Engine';
export const GROUP_NAME = 'Engine 3';
export const SECTION_PREDICTION = 'prediction';
export const SECTION_GROUND_TRUTH = 'ground_truth';

export function isBackendConfigured() {
  return Boolean(DEFAULT_API_BASE_URL || isSupabaseConfigured());
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

function unwrapListResponse(response, keys) {
  if (Array.isArray(response)) {
    return response;
  }

  for (const key of keys) {
    const value = response?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return response ?? [];
}

function unwrapObjectResponse(response, keys) {
  if (response && !Array.isArray(response) && typeof response === 'object') {
    for (const key of keys) {
      const value = response[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
      }
    }
  }

  return response ?? null;
}

async function requestFirstAvailable(paths, options = {}) {
  let lastError = null;

  for (const path of paths) {
    try {
      return await request(path, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Request failed');
}

function formatLineup(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value ?? '');
}

function parseRegionAndType(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { region: '', type: '' };
  }

  const slashParts = text.split('/').map((part) => part.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    return { region: slashParts[0], type: slashParts.slice(1).join(' / ') };
  }

  const pipeParts = text.split('|').map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    return { region: pipeParts[0], type: pipeParts.slice(1).join(' | ') };
  }

  return { region: text, type: '' };
}

function toTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeConfidence(value, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

export async function loadBattles() {
  if (DEFAULT_API_BASE_URL) {
    return request('/api/predictions');
  }

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('battles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function savePrediction(payload) {
  if (!DEFAULT_API_BASE_URL && supabase) {
    const row = {
      match_id: payload.match_id,
      engine_name: payload.engine_name,
      group_name: payload.group_name,
      section: payload.section,
      input_data_source: payload.input_data_source,
      gym_leader_name: payload.gym_leader_name,
      gym_leader_region: payload.gym_leader_region,
      gym_leader_type: payload.gym_leader_type,
      challenger_region: payload.challenger_region,
      gym_leader_lineup: payload.gym_leader_lineup,
      challenger_lineup: payload.challenger_lineup,
      engines_used: payload.engines_used,
      battler_a: payload.battler_a,
      battler_b: payload.battler_b,
      predicted_winner: payload.predicted_winner,
      confidence_score: payload.confidence_score,
      prediction_reason: payload.prediction_reason,
      model_used: payload.model_used,
      timestamp_before_battle: payload.timestamp_before_battle,
      timestamp: payload.timestamp,
    };

    const { data, error } = await supabase
      .from('battles')
      .insert(row)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await appendAuditLog({
      action_done: 'INSERT_PREDICTION',
      affected_record: data.match_id,
      old_value: null,
      new_value: data,
      timestamp: data.timestamp_before_battle || data.timestamp || payload.timestamp,
    });

    return { record: data };
  }

  return request('/api/predictions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveGroundTruth(payload) {
  if (!DEFAULT_API_BASE_URL && supabase) {
    const { data: existingBattle } = await supabase
      .from('battles')
      .select('*')
      .eq('match_id', payload.match_id)
      .maybeSingle();

    const updates = {
      actual_winner: payload.actual_winner,
      correct_prediction: payload.correct_prediction,
      replay_link: payload.replay_link,
      screenshot_or_photo_link: payload.screenshot_or_photo_link,
      screenshot_filename: payload.screenshot_filename,
      final_score: payload.final_score,
      number_of_turns: payload.number_of_turns,
      mvp_pokemon: payload.mvp_pokemon,
      section: payload.section,
      timestamp_after_battle: payload.timestamp_after_battle,
      timestamp: payload.timestamp,
    };

    const { data, error } = await supabase
      .from('battles')
      .update(updates)
      .eq('match_id', payload.match_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await appendAuditLog({
      action_done: 'UPDATE_GROUND_TRUTH',
      affected_record: data.match_id,
      old_value: existingBattle ?? null,
      new_value: data,
      timestamp: data.timestamp_after_battle || payload.timestamp_after_battle || new Date().toISOString(),
    });

    return { record: data };
  }

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

export async function loadMetrics() {
  if (DEFAULT_API_BASE_URL) {
    const response = await requestFirstAvailable(['/api/stats', '/api/metrics']);
    return unwrapObjectResponse(response, ['metrics', 'data', 'stats']) ?? response;
  }

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('battles')
    .select('battler_a,battler_b,predicted_winner,actual_winner,confidence_score');

  if (error) {
    throw error;
  }

  return computeMetricsFromBattles(data ?? []);
}

export async function loadAuditLog() {
  if (DEFAULT_API_BASE_URL) {
    const response = await requestFirstAvailable(['/api/audit-log', '/api/audit', '/api/logs']);
    return unwrapListResponse(response, ['records', 'auditLog', 'logs', 'entries']);
  }

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function appendAuditLog({ action_done, affected_record, old_value, new_value, timestamp }) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from('audit_log').insert({
    user_or_operator: 'system',
    action_done,
    affected_table: 'battles',
    affected_record,
    old_value,
    new_value,
    timestamp: toTimestamp(timestamp),
  });

  if (error) {
    throw error;
  }
}

function computeMetricsFromBattles(battles) {
  const resolvedBattles = battles.filter((battle) => battle.actual_winner);
  const tp = resolvedBattles.filter(
    (battle) => battle.predicted_winner === battle.battler_a && battle.actual_winner === battle.battler_a,
  ).length;
  const fp = resolvedBattles.filter(
    (battle) => battle.predicted_winner === battle.battler_a && battle.actual_winner === battle.battler_b,
  ).length;
  const fn = resolvedBattles.filter(
    (battle) => battle.predicted_winner === battle.battler_b && battle.actual_winner === battle.battler_a,
  ).length;
  const tn = resolvedBattles.filter(
    (battle) => battle.predicted_winner === battle.battler_b && battle.actual_winner === battle.battler_b,
  ).length;
  const total = resolvedBattles.length;
  const correct = resolvedBattles.filter((battle) => battle.predicted_winner === battle.actual_winner).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const precisionRate = tp + fp ? tp / (tp + fp) : 0;
  const recallRate = tp + fn ? tp / (tp + fn) : 0;
  const precision = Math.round(precisionRate * 100);
  const recall = Math.round(recallRate * 100);
  const f1Rate = precisionRate + recallRate ? (2 * precisionRate * recallRate) / (precisionRate + recallRate) : 0;
  const f1 = Math.round(f1Rate * 100);
  const brier = total
    ? resolvedBattles.reduce((sum, battle) => {
        const probability = sanitizeConfidence(battle.confidence_score, 0.5);
        const actualPositive = battle.actual_winner === battle.battler_a ? 1 : 0;
        const predictedPositive = battle.predicted_winner === battle.battler_a ? probability : 1 - probability;
        return sum + ((predictedPositive - actualPositive) ** 2);
      }, 0) / total
    : null;

  return {
    total_battles: total,
    correct,
    tp,
    fp,
    fn,
    tn,
    accuracy_pct: accuracy,
    precision_pct: precision,
    recall_pct: recall,
    f1_pct: f1,
    brier_score: brier !== null ? Number(brier.toFixed(4)) : null,
  };
}

export { safeBuildBattlePrediction };

export function nextMatchId(battles) {
  const highest = battles.reduce((max, battle) => {
    const source = String(battle.matchId ?? battle.match_id ?? battle.id ?? 0);
    const digits = source.match(/\d+/g)?.join('');
    const value = Number.parseInt(digits || source, 10);
    return Number.isNaN(value) ? max : Math.max(max, value);
  }, 0);

  return String(highest + 1).padStart(6, '0');
}

export function toDisplayBattle(record) {
  const matchId = String(record.matchId ?? record.match_id ?? record.id ?? '');
  const confidence = sanitizeConfidence(record.confidence ?? record.confidence_score ?? 0, 0.5);
  return {
    id: matchId,
    matchId,
    recordId: String(record.id ?? ''),
    gymLeaderName: record.gymLeaderName ?? record.gym_leader_name ?? record.battler_a ?? '',
    challengerName: record.challengerName ?? record.challenger_name ?? record.battler_b ?? '',
    gymLeaderRegion: record.gymLeaderRegion ?? record.gym_leader_region ?? '',
    gymLeaderType: record.gymLeaderType ?? record.gym_leader_type ?? '',
    challengerRegion: record.challengerRegion ?? record.challenger_region ?? '',
    gymLeaderLineup: formatLineup(record.gymLeaderLineup ?? record.gym_leader_lineup ?? ''),
    challengerLineup: formatLineup(record.challengerLineup ?? record.challenger_lineup ?? ''),
    engineUsed: record.engineUsed ?? record.engines_used ?? record.engine_used ?? '',
    regionFilter: record.regionFilter ?? record.region_filter ?? null,
    typeFilter: record.typeFilter ?? record.type_filter ?? null,
    restrictionFilter: record.restrictionFilter ?? record.restriction_filter ?? null,
    validationCheck: record.validationCheck ?? record.validation_check ?? null,
    battlerA: record.battlerA ?? record.battler_a ?? '',
    battlerB: record.battlerB ?? record.battler_b ?? '',
    predictedWinner: record.predictedWinner ?? record.predicted_winner ?? '',
    confidence,
    reason: record.reason ?? record.prediction_reason ?? '',
    model: record.model ?? record.model_used ?? '',
    timestamp: record.timestamp ?? record.timestamp_before_battle ?? record.timestamp_after_battle ?? record.created_at ?? '',
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

export function toPredictionPayload({ form, matchId, timestamp, prediction }) {
  const battlerA = form.gymLeaderName?.trim();
  const battlerB = form.challengerName?.trim();
  const { region, type } = parseRegionAndType(form.gymLeaderRegion);
  const battlePrediction = prediction ?? safeBuildBattlePrediction(form);
  const predictedWinner =
    battlePrediction.predictedWinnerSide === 'challenger'
      ? battlerB || battlePrediction.predictedWinnerName || 'Challenger'
      : battlerA || battlePrediction.predictedWinnerName || 'Gym Leader';
  const confidenceScore = Number.isFinite(battlePrediction.confidence)
    ? sanitizeConfidence(battlePrediction.confidence / 100, 0.5)
    : sanitizeConfidence(Number(form.confidence) / 100, 0.5);
  const analystNote = form.reason.trim();
  const predictionReason = analystNote
    ? `${battlePrediction.reason?.trim() || 'Rule-based matchup analysis'} | Analyst note: ${analystNote}`
    : battlePrediction.reason?.trim() || 'Rule-based matchup analysis';
  const modelUsed = battlePrediction.model || form.model;

  return {
    engine_name: ENGINE_NAME,
    group_name: GROUP_NAME,
    section: SECTION_PREDICTION,
    input_data_source: DATA_SOURCE,
    match_id: form.matchId?.trim() || matchId,
    matchId: form.matchId?.trim() || matchId,
    gym_leader_name: form.gymLeaderName.trim(),
    gym_leader_region: region,
    gym_leader_type: type,
    challenger_region: form.challengerRegion.trim(),
    gym_leader_lineup: parseBattleLineup(form.gymLeaderLineup),
    challenger_lineup: parseBattleLineup(form.challengerLineup),
    engines_used: form.engineUsed.trim(),
    battler_a: battlerA,
    battler_b: battlerB,
    predicted_winner: predictedWinner,
    confidence_score: confidenceScore,
    prediction_reason: predictionReason,
    model_used: modelUsed,
    timestamp_before_battle: timestamp,
    timestamp,
  };
}

export function toGroundTruthPayload({ form, battle, screenshotUrl = '', screenshotName = '' }) {
  const correctPrediction = battle
    ? battle.predictedWinner === form.actualWinner
    : null;
  const timestampAfterBattle = new Date().toISOString();

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
    number_of_turns: form.turns ? toFiniteNumber(form.turns, null) : null,
    mvp_pokemon: form.mvp.trim(),
    timestamp_after_battle: timestampAfterBattle,
    timestamp: timestampAfterBattle,
  };
}
