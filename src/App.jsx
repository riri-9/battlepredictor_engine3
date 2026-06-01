import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  isBackendConfigured,
  loadBattles,
  loadMetrics,
  loadAuditLog,
  safeBuildBattlePrediction,
  nextMatchId,
  toDisplayBattle,
  toGroundTruthPayload,
  toPredictionPayload,
  saveGroundTruth,
  savePrediction,
} from './lib/backend';

const initialPredictions = [];

const predictionModels = [
  'Decision Tree',
  'Random Forest',
  'K-NN',
  'Naive Bayes',
  'Logistic Regression',
  'Rule-Based Classifier',
];

const specInputs = [
  ['Match ID', 'Unique identifier for the battle'],
  ['Gym Leader Name', 'Name of Gym Leader'],
  ['Challenger Name', 'Name of challenger or attacking team'],
  ['Gym Leader Region and Type', 'Gym Leader’s selected region and type specialization'],
  ['Challenger Region', 'Region assigned to the challenger'],
  ['Gym Leader Lineup', 'Pokémon used by the Gym Leader'],
  ['Challenger Lineup', 'Pokémon used by the challenger'],
  ['Engine/s Used', 'Team Engine, Challenger Selection Engine, or other system feature used'],
];

const specPredictionOutputs = [
  ['Predicted Winner', 'Expected winner before the battle'],
  ['Confidence Score', 'Example: 0.70 or 70%'],
  ['Prediction Reason', 'Key factors used in prediction'],
  ['Timestamp', 'Time when prediction was recorded'],
];

const specGroundTruthOutputs = [
  ['Actual Winner', 'Winner based on Pokémon Showdown result'],
  ['Correct / Incorrect', 'Whether the prediction matched the actual result'],
  ['Replay Link', 'Pokémon Showdown replay or battle log'],
  ['Screenshot / Photo Link', 'Supporting proof'],
  ['Final Score, if available', 'Example: 2-0, 1-0, etc.'],
  ['Number of Turns, if available', 'Battle length'],
  ['Timestamp', 'Time when result was recorded'],
];

const specModels = [
  ['Decision Tree', 'Predict win/loss using explainable rules'],
  ['Random Forest', 'Predict winner using multiple decision trees'],
  ['K-NN', 'Predict based on similar matchups'],
  ['Naive Bayes', 'Predict probability of winning'],
  ['Logistic Regression', 'Estimate win probability'],
  ['Rule-Based Classifier', 'Use type coverage, stats, weakness count, and team balance'],
];

const specMetrics = [
  ['Accuracy', 'Percentage of correctly predicted battles'],
  ['Confusion Matrix', 'Shows correct and incorrect predictions'],
  ['Precision', 'Reliability when predicting a winner'],
  ['Recall', 'Ability to capture actual wins'],
  ['F1-Score', 'Balance between precision and recall'],
];

const specProbabilityMetrics = [
  ['Log Loss', 'Penalizes confident but wrong predictions'],
  ['Calibration Table', 'Checks if confidence levels match actual results'],
];

const specImplementationRules = [
  ['Native Region', 'The original region or generation where the Pokémon belongs'],
  ['Region Filter', 'Ensures only Pokémon native to the selected/assigned region are recommended'],
  ['Type Filter', 'Ensures Gym Leader teams follow the selected type specialization'],
  ['Restriction Filter', 'Excludes Legendary, Mythical, Paradox Pokémon, and banned battle mechanics'],
  ['Validation Check', 'Flags invalid recommendations before they are used'],
  ['Battle Log', 'Records battles and results'],
  ['Prediction Log', 'Records predictions before each battle'],
  ['Ground Truth Log', 'Records actual results after each battle'],
  ['Audit Trail', 'Shows timestamps and changes, if available'],
];

const specSuggestedFormat = [
  ['Pikachu', 'Kanto', 'Electric', 'Fast Attacker', 'Native Kanto Electric-type Pokémon'],
  ['Raichu', 'Kanto', 'Electric', 'Special Attacker', 'Native Kanto Electric-type evolution'],
  ['Electabuzz', 'Kanto', 'Electric', 'Physical/Special Attacker', 'Native Kanto Electric-type option'],
];

const specSystemFeatures = [
  ['Data Loading', 'Must retrieve or use PokéAPI-based data'],
  ['Native Region Filtering', 'Must filter Pokémon according to native region'],
  ['Restriction Filtering', 'Must remove restricted Pokémon and banned mechanics'],
  ['Model / Logic', 'Must use a model, scoring system, or clear algorithmic logic'],
  ['Output Display', 'Must show readable results'],
  ['System Encoding', 'Must save engine outputs and predictions'],
  ['Battle Logging', 'Must record battle results'],
  ['Ground Truth Storage', 'Must store actual winners'],
  ['Analytics', 'Must show metrics, tables, or graphs when possible'],
  ['Documentation', 'Must include complete system documentation'],
  ['Data Pipeline Diagram', 'Required'],
];

const tabs = [
  { id: 'predict', label: 'Predict', icon: LightningIcon },
  { id: 'groundTruth', label: 'Ground Truth', icon: SwordsIcon },
  { id: 'history', label: 'History', icon: BookIcon },
  { id: 'analytics', label: 'Analytics', icon: ChartIcon },
  { id: 'auditLog', label: 'Audit Log', icon: ShieldIcon },
];

function normalizeMatchId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeModelName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function toConfidenceValue(value, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

function getBattleMatchKeys(battle) {
  return [
    battle?.id,
    battle?.matchId,
    battle?.match_id,
    battle?.matchID,
  ]
    .filter(Boolean)
    .map((value) => normalizeMatchId(value));
}

function findBattleByMatchId(battles, matchId) {
  const target = normalizeMatchId(matchId);
  if (!target) {
    return undefined;
  }

  return battles.find((battle) => {
    const keys = getBattleMatchKeys(battle);
    if (keys.includes(target)) {
      return true;
    }

    const targetDigits = target.match(/\d+/g)?.join('');
    if (!targetDigits) {
      return false;
    }

    return keys.some((key) => {
      const keyDigits = key.match(/\d+/g)?.join('');
      return keyDigits ? Number.parseInt(keyDigits, 10) === Number.parseInt(targetDigits, 10) : false;
    });
  });
}

function calculateLocalMetrics(battles) {
  const resolvedBattles = battles.filter((battle) => battle.actualWinner && battle.predictedWinner);
  const tp = resolvedBattles.filter(
    (battle) => battle.predictedWinner === battle.battlerA && battle.actualWinner === battle.battlerA,
  ).length;
  const fp = resolvedBattles.filter(
    (battle) => battle.predictedWinner === battle.battlerA && battle.actualWinner === battle.battlerB,
  ).length;
  const fn = resolvedBattles.filter(
    (battle) => battle.predictedWinner === battle.battlerB && battle.actualWinner === battle.battlerA,
  ).length;
  const tn = resolvedBattles.filter(
    (battle) => battle.predictedWinner === battle.battlerB && battle.actualWinner === battle.battlerB,
  ).length;
  const total = resolvedBattles.length;
  const correct = resolvedBattles.filter((battle) => battle.predictedWinner === battle.actualWinner).length;
  const precisionRate = tp + fp ? tp / (tp + fp) : 0;
  const recallRate = tp + fn ? tp / (tp + fn) : 0;
  return {
    total_battles: total,
    correct,
    tp,
    fp,
    fn,
    tn,
    accuracy_pct: total ? Math.round((correct / total) * 100) : 0,
    precision_pct: Math.round(precisionRate * 100),
    recall_pct: Math.round(recallRate * 100),
    f1_pct: Math.round(((precisionRate + recallRate) ? (2 * precisionRate * recallRate) / (precisionRate + recallRate) : 0) * 100),
  };
}

function getAvailableModels(battles) {
  return [
    'all',
    ...new Set(
      battles
        .map((battle) => String(battle.model ?? '').trim())
        .filter(Boolean),
    ),
  ];
}

function App() {
  const [activeTab, setActiveTab] = useState('predict');
  const [predictions, setPredictions] = useState(initialPredictions);
  const [syncStatus, setSyncStatus] = useState(isBackendConfigured() ? 'connecting' : 'local');
  const [syncMessage, setSyncMessage] = useState(
    isBackendConfigured()
      ? 'Connecting to backend...'
      : 'Local draft mode. Configure VITE_API_BASE_URL or Supabase env vars to connect the backend.',
  );
  const [isSavingPrediction, setIsSavingPrediction] = useState(false);
  const [isSavingGroundTruth, setIsSavingGroundTruth] = useState(false);
  const [predictionNotice, setPredictionNotice] = useState('');
  const [predictionForm, setPredictionForm] = useState({
    matchId: '',
    gymLeaderName: '',
    challengerName: '',
    gymLeaderRegion: '',
    challengerRegion: '',
    gymLeaderLineup: '',
    challengerLineup: '',
    engineUsed: '',
    regionFilter: true,
    typeFilter: true,
    restrictionFilter: true,
    validationCheck: true,
    model: 'Random Forest',
    confidenceMode: 'auto',
    predictedWinnerSide: 'gymLeader',
    confidence: 70,
    reason: '',
  });
  const [truthForm, setTruthForm] = useState({
    matchId: '',
    actualWinner: '',
    replayLink: '',
    screenshotFile: null,
    screenshotPreview: '',
    screenshotName: '',
    turns: '',
    finalScore: '',
    mvp: '',
  });
  const [metrics, setMetrics] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [analyticsModelFilter, setAnalyticsModelFilter] = useState('all');

  const localMetrics = useMemo(() => calculateLocalMetrics(predictions), [predictions]);
  const metricsSnapshot = metrics ?? localMetrics;
  const totalBattles = metricsSnapshot.total_battles ?? predictions.length;
  const correctBattles = metricsSnapshot.correct ?? 0;
  const accuracy = metricsSnapshot.accuracy_pct ?? 0;
  const precision = metricsSnapshot.precision_pct ?? 0;
  const recall = metricsSnapshot.recall_pct ?? 0;
  const f1Score = metricsSnapshot.f1_pct ?? 0;
  const pendingBattles = predictions.filter((battle) => !battle.actualWinner);

  const selectedBattle = findBattleByMatchId(predictions, truthForm.matchId) ?? null;

  const resolvedHistory = useMemo(
    () =>
      [...predictions].sort((a, b) => Number(b.id) - Number(a.id)),
    [predictions],
  );

  useEffect(() => {
    if (!selectedBattle) {
      return;
    }

    setTruthForm((current) => ({
      ...current,
      actualWinner: selectedBattle.actualWinner || '',
      replayLink: selectedBattle.replayLink || '',
      screenshotPreview: selectedBattle.screenshotPreview || '',
      screenshotName: selectedBattle.screenshotName || '',
    }));
  }, [selectedBattle]);

  useEffect(() => {
    if (!isBackendConfigured()) {
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const response = await loadBattles();
        const records = Array.isArray(response)
          ? response
          : response?.records ?? response?.predictions ?? [];

        if (!isMounted || !records.length) {
          if (isMounted) {
            setSyncStatus('connected');
            setSyncMessage('Backend connected. No saved battles yet.');
          }
          return;
        }

        const normalized = records.map(toDisplayBattle);
        setPredictions(normalized);
        setTruthForm((current) => ({
          ...current,
          matchId: normalized[0]?.id ?? current.matchId,
          actualWinner: normalized[0]?.actualWinner || current.actualWinner || '',
          replayLink: normalized[0]?.replayLink || '',
          screenshotPreview: normalized[0]?.screenshotPreview || '',
          screenshotName: normalized[0]?.screenshotName || '',
        }));
        setSyncStatus('connected');
        setSyncMessage('Backend connected and battle records loaded.');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setSyncStatus('fallback');
        setSyncMessage('Backend unavailable. Using local draft mode until the API is online.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  async function createPrediction() {
    const gymLeaderName = predictionForm.gymLeaderName.trim();
    const challengerName = predictionForm.challengerName.trim();

    if (!gymLeaderName || !challengerName) {
      setPredictionNotice('Enter both Gym Leader and Challenger names before generating a prediction.');
      setActiveTab('predict');
      return;
    }

    const matchId = nextMatchId(predictions);
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const enginePrediction = safeBuildBattlePrediction(predictionForm, predictions);
    const payload = toPredictionPayload({
      form: predictionForm,
      matchId,
      timestamp,
      prediction: enginePrediction,
    });
    const localBattle = toDisplayBattle({
      ...payload,
      predicted_winner: payload.predicted_winner,
      confidence_score: payload.confidence_score,
      prediction_reason: payload.prediction_reason,
      model_used: payload.model_used,
      timestamp,
      actual_winner: null,
      number_of_turns: null,
      final_score: null,
      mvp_pokemon: null,
      replay_link: '',
      screenshot_or_photo_link: '',
      screenshot_filename: '',
    });

    setIsSavingPrediction(true);
    try {
      const response = isBackendConfigured() ? await savePrediction(payload) : null;
      const record = toDisplayBattle(response?.record ?? response ?? localBattle);
      const finalBattle = {
        ...record,
        ...localBattle,
        id: String(record.id || record.match_id || localBattle.id),
        matchId: String(record.matchId || record.match_id || localBattle.matchId || localBattle.id),
        gymLeaderName: localBattle.gymLeaderName || record.gymLeaderName || record.battlerA || '',
        challengerName:
          localBattle.challengerName || record.challengerName || record.battlerB || '',
        battlerA: localBattle.battlerA || record.battlerA || localBattle.gymLeaderName || '',
        battlerB: localBattle.battlerB || record.battlerB || localBattle.challengerName || '',
        screenshotPreview:
          record.screenshotPreview || record.screenshot_or_photo_link || localBattle.screenshotPreview || '',
        screenshotName: record.screenshotName || record.screenshot_filename || localBattle.screenshotName || '',
      };

      setPredictions((current) => [finalBattle, ...current.filter((battle) => battle.id !== finalBattle.id)]);
      setTruthForm((current) => ({
        ...current,
        matchId: finalBattle.id,
        actualWinner: '',
      }));
      setPredictionNotice('');
      setActiveTab('predict');
      setPredictionForm((current) => ({
        ...current,
        matchId: '',
        gymLeaderName: '',
        challengerName: '',
        gymLeaderRegion: '',
        challengerRegion: '',
        gymLeaderLineup: '',
        challengerLineup: '',
        engineUsed: '',
        model: 'Random Forest',
        confidenceMode: 'auto',
        predictedWinnerSide: 'gymLeader',
        confidence: 70,
        reason: '',
      }));
      setSyncStatus(isBackendConfigured() ? 'connected' : 'local');
      setSyncMessage(isBackendConfigured() ? 'Prediction saved to backend.' : 'Prediction saved locally.');
    } catch (error) {
      setPredictions((current) => [localBattle, ...current.filter((battle) => battle.id !== localBattle.id)]);
      setTruthForm((current) => ({
        ...current,
        matchId: localBattle.id,
        actualWinner: '',
      }));
      setPredictionNotice('');
      setActiveTab('predict');
      setPredictionForm((current) => ({
        ...current,
        matchId: '',
        gymLeaderName: '',
        challengerName: '',
        gymLeaderRegion: '',
        challengerRegion: '',
        gymLeaderLineup: '',
        challengerLineup: '',
        engineUsed: '',
        model: 'Random Forest',
        confidenceMode: 'auto',
        predictedWinnerSide: 'gymLeader',
        confidence: 70,
        reason: '',
      }));
      setSyncStatus('fallback');
      setSyncMessage('Backend save failed. Kept the prediction locally.');
      setPredictionNotice(`Save failed: ${String(error?.message ?? error)}`);
    } finally {
      setIsSavingPrediction(false);
    }
  }

  async function submitGroundTruth() {
    let screenshotPreview = truthForm.screenshotPreview;
    let screenshotName = truthForm.screenshotName;

    if (truthForm.screenshotFile) {
      screenshotPreview = await readFileAsDataURL(truthForm.screenshotFile);
      screenshotName = truthForm.screenshotFile.name;
    }

    const currentBattle = findBattleByMatchId(predictions, truthForm.matchId);
    const payload = toGroundTruthPayload({
      form: truthForm,
      battle: currentBattle,
      screenshotUrl: screenshotPreview,
      screenshotName,
    });

    setIsSavingGroundTruth(true);
    try {
      const response = isBackendConfigured()
        ? await saveGroundTruth({ ...payload, screenshot_file: truthForm.screenshotFile })
        : null;
      const record = toDisplayBattle(response?.record ?? response ?? payload);
      const updatedBattle = {
        ...record,
        ...(currentBattle || {}),
        id: String(record.id || record.match_id || truthForm.matchId),
        matchId: String(record.matchId || record.match_id || truthForm.matchId),
        gymLeaderName:
          currentBattle?.gymLeaderName || record.gymLeaderName || currentBattle?.battlerA || '',
        challengerName:
          currentBattle?.challengerName || record.challengerName || currentBattle?.battlerB || '',
        battlerA: currentBattle?.battlerA || record.battlerA || currentBattle?.gymLeaderName || '',
        battlerB: currentBattle?.battlerB || record.battlerB || currentBattle?.challengerName || '',
        actualWinner: payload.actual_winner,
        replayLink: payload.replay_link,
        screenshotPreview:
          record.screenshotPreview || record.screenshot_or_photo_link || screenshotPreview,
        screenshotName: record.screenshotName || record.screenshot_filename || screenshotName,
        turns: payload.number_of_turns,
        finalScore: payload.final_score,
        mvp: payload.mvp_pokemon,
        confidence: currentBattle?.confidence ?? record.confidence ?? 0,
        model: currentBattle?.model || record.model || '',
      };

      setPredictions((current) =>
        current.map((battle) => (battle.id === truthForm.matchId ? updatedBattle : battle)),
      );
      setActiveTab('groundTruth');
      setTruthForm((current) => ({
        ...current,
        matchId: '',
        actualWinner: '',
        replayLink: '',
        screenshotFile: null,
        screenshotPreview: '',
        screenshotName: '',
        turns: '',
        finalScore: '',
        mvp: '',
      }));
      setSyncStatus(isBackendConfigured() ? 'connected' : 'local');
      setSyncMessage(
        isBackendConfigured()
          ? 'Ground truth saved to backend.'
          : 'Ground truth saved locally.',
      );
    } catch (error) {
      const updatedBattle = {
        ...(currentBattle || {}),
        id: String(currentBattle?.id || truthForm.matchId),
        matchId: String(currentBattle?.matchId || truthForm.matchId),
        actualWinner: truthForm.actualWinner,
        replayLink: truthForm.replayLink.trim(),
        screenshotPreview,
        screenshotName,
        turns: truthForm.turns ? Number(truthForm.turns) : null,
        finalScore: truthForm.finalScore.trim(),
        mvp: truthForm.mvp.trim(),
        correctPrediction: currentBattle ? currentBattle.predictedWinner === truthForm.actualWinner : null,
        confidence: currentBattle?.confidence ?? 0,
        model: currentBattle?.model || '',
      };

      setPredictions((current) =>
        current.map((battle) => (battle.id === truthForm.matchId ? updatedBattle : battle)),
      );
      setActiveTab('groundTruth');
      setTruthForm((current) => ({
        ...current,
        matchId: '',
        actualWinner: '',
        replayLink: '',
        screenshotFile: null,
        screenshotPreview: '',
        screenshotName: '',
        turns: '',
        finalScore: '',
        mvp: '',
      }));
      setSyncStatus('fallback');
      setSyncMessage('Backend save failed. Ground truth was kept locally.');
    } finally {
      setIsSavingGroundTruth(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05050d] text-slate-100">
      <div className="pointer-events-none absolute inset-0 subtle-grid opacity-25" />
      <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-arena-400/6 blur-2xl" />
      <div className="pointer-events-none absolute right-0 top-24 h-96 w-96 rounded-full bg-sky-400/6 blur-2xl" />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-arena-400/15 bg-[#05050d]/88 px-4 py-4 backdrop-blur-sm md:px-8">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-arena-400/40 bg-gradient-to-br from-red-500 via-red-400 to-arena-400 shadow-glow">
              <div className="h-4 w-4 rounded-full border-2 border-slate-950/80 bg-arena-400" />
            </div>
            <div>
              <div className="font-display text-xl font-bold uppercase tracking-[0.18em] text-arena-400 md:text-2xl">
                Battle Predictor
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.45em] text-slate-400 md:text-xs">
                Engine 3 - Pokemon Showdown
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  syncStatus === 'connected' ? 'bg-emerald-400/15 text-emerald-400' :
                  syncStatus === 'connecting' ? 'bg-amber-400/15 text-amber-400' :
                  'bg-red-400/15 text-red-400'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    syncStatus === 'connected' ? 'bg-emerald-400' :
                    syncStatus === 'connecting' ? 'bg-amber-400' :
                    'bg-red-400'
                  }`} />
                  {syncStatus === 'connected' ? 'Supabase' : syncStatus === 'connecting' ? 'Connecting' : 'Local'}
                </span>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-right md:flex">
            <StatBadge label="Overall Accuracy" value={`${accuracy}%`} />
            <StatBadge label="Battles Logged" value={`${totalBattles}`} />
          </div>
        </div>

        <nav className="mx-auto mt-4 flex max-w-[1440px] gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const count = tab.id === 'groundTruth' ? pendingBattles.length : tab.id === 'history' ? totalBattles : predictions.filter((battle) => battle.actualWinner === null).length;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 rounded-2xl px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.18em] transition ${
                  active
                    ? 'bg-arena-400/10 text-arena-400 shadow-glow'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.id === 'groundTruth' && count > 0 ? (
                  <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                    {count}
                  </span>
                ) : null}
                {active ? <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-arena-400" /> : null}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1440px] px-4 pb-6 pt-40 md:px-8 md:pt-44">

        {activeTab === 'predict' ? (
          <>
      <PredictView
              form={predictionForm}
              setForm={setPredictionForm}
              predictions={predictions}
              onGenerate={createPrediction}
              isSaving={isSavingPrediction}
              notice={predictionNotice}
              accuracy={accuracy}
              precision={precision}
              recall={recall}
              f1Score={f1Score}
            />
          </>
        ) : null}

        {activeTab === 'groundTruth' ? (
          <GroundTruthView
            form={truthForm}
            setForm={setTruthForm}
            battles={predictions}
            selectedBattle={selectedBattle}
            onSubmit={submitGroundTruth}
            accuracy={accuracy}
            isSaving={isSavingGroundTruth}
          />
        ) : null}

        {activeTab === 'history' ? (
          <HistoryView
            accuracy={accuracy}
            totalBattles={totalBattles}
            correctBattles={correctBattles}
            battles={resolvedHistory}
          />
        ) : null}

        {activeTab === 'analytics' ? (
          <AnalyticsView
            metrics={metrics}
            isLoading={isLoadingMetrics}
            predictions={predictions}
            modelFilter={analyticsModelFilter}
            setModelFilter={setAnalyticsModelFilter}
            onRefresh={async () => {
              if (!isBackendConfigured()) return;
              setIsLoadingMetrics(true);
              try {
                const m = await loadMetrics();
                setMetrics(m);
              } catch (e) { console.warn('Metrics load failed:', e); }
              finally { setIsLoadingMetrics(false); }
            }}
          />
        ) : null}

        {activeTab === 'auditLog' ? (
          <AuditLogView
            auditLog={auditLog}
            isLoading={isLoadingAudit}
            onRefresh={async () => {
              if (!isBackendConfigured()) return;
              setIsLoadingAudit(true);
              try {
                const logs = await loadAuditLog();
                setAuditLog(logs);
              } catch (e) { console.warn('Audit load failed:', e); }
              finally { setIsLoadingAudit(false); }
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

function PredictViewLegacy({ form, setForm, predictions, onGenerate }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(340px,520px)_1fr] xl:h-[calc(100vh-12rem)] xl:overflow-hidden">
      <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6 xl:sticky xl:top-32 xl:self-start xl:h-fit xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto xl:pr-4">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-100">
              <span className="text-arena-400">⚡</span> New Battle Prediction
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
              Pre-battle intelligence capture
            </p>
          </div>
          <span className="rounded-full border border-arena-400/25 bg-arena-400/10 px-3 py-1 font-mono text-xs font-bold text-arena-400">
            #{nextMatchId(predictions)}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Battler A"
            value={form.battlerA}
            onChange={(value) => setForm((current) => ({ ...current, battlerA: value }))}
            placeholder="e.g. AshKetchum"
          />
          <TextField
            label="Battler B"
            value={form.battlerB}
            onChange={(value) => setForm((current) => ({ ...current, battlerB: value }))}
            placeholder="e.g. GaryOak"
          />
        </div>

        <div className="mt-5">
          <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            Predicted Winner
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { side: 'A', label: 'Battler A' },
              { side: 'B', label: 'Battler B' },
            ].map((option) => (
              <button
                key={option.side}
                onClick={() =>
                  setForm((current) => ({ ...current, predictedWinnerSide: option.side }))
                }
                className={`rounded-2xl border px-4 py-4 font-display text-base font-bold transition ${
                  form.predictedWinnerSide === option.side
                    ? 'border-arena-400/60 bg-arena-400/10 text-arena-400 shadow-glow'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:border-arena-400/35 hover:bg-arena-400/5'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { value: 'auto', label: 'Auto (Engine)' },
              { value: 'manual', label: 'Manual Override' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setForm((current) => ({ ...current, confidenceMode: option.value }))
                }
                className={`rounded-full border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] transition ${
                  form.confidenceMode === option.value
                    ? 'border-arena-400/60 bg-arena-400/15 text-arena-300 shadow-glow'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-arena-400/35 hover:text-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            {form.confidenceMode === 'manual' ? 'Analyst Confidence' : 'Engine Confidence'}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="100"
              value={form.confidence}
              disabled={form.confidenceMode !== 'manual'}
              onChange={(event) =>
                setForm((current) => ({ ...current, confidence: Number(event.target.value) }))
              }
              className={`h-2 w-full appearance-none rounded-full bg-white/15 accent-arena-400 ${
                form.confidenceMode !== 'manual' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            />
            <span className="min-w-14 text-right font-display text-sm font-bold text-arena-400">
              {form.confidenceMode === 'manual' ? form.confidence : enginePrediction.confidence}%
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {form.confidenceMode === 'manual'
              ? 'Manual override is active and will be saved with this prediction.'
              : 'Auto mode uses the engine confidence from the selected model.'}
          </p>
        </div>

        <div className="mt-5">
          <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            Prediction Model
          </label>
          <select
            value={form.model}
            onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
            className="w-full rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 py-3 font-display text-base text-slate-100 outline-none transition focus:border-arena-400 focus:ring-2 focus:ring-arena-400/20"
          >
            {predictionModels.map((model) => (
              <option key={model} value={model} className="bg-slate-950">
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            Prediction Reason / Key Features
          </label>
          <textarea
            rows={6}
            value={form.reason}
            onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Type advantage, speed tier, entry hazard pressure, and win conditions..."
            className="w-full resize-none rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 py-3 font-mono text-sm leading-6 text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-arena-400 focus:ring-2 focus:ring-arena-400/20"
          />
        </div>

        <button
          onClick={onGenerate}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-arena-400/50 bg-gradient-to-r from-arena-400/15 via-arena-400/10 to-transparent px-5 py-4 font-display text-lg font-bold uppercase tracking-[0.2em] text-arena-400 shadow-glow transition hover:-translate-y-0.5 hover:bg-arena-400/20"
        >
          <span>⚡</span>
          Generate Prediction
        </button>
      </section>

      <section className="space-y-4 xl:h-full xl:overflow-y-auto xl:pr-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-slate-100">
              Latest Predictions
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
              {predictions.length} total
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
            Live feed
          </div>
        </div>

        <div className="space-y-4">
          {predictions.map((battle) => (
            <PredictionCard key={battle.id} battle={battle} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PredictView({
  form,
  setForm,
  predictions,
  onGenerate,
  isSaving,
  notice,
  accuracy,
  precision,
  recall,
  f1Score,
}) {
  const engineInputs = {
    matchId: form.matchId,
    gymLeaderName: form.gymLeaderName,
    challengerName: form.challengerName,
    gymLeaderRegion: form.gymLeaderRegion,
    challengerRegion: form.challengerRegion,
    gymLeaderLineup: form.gymLeaderLineup,
    challengerLineup: form.challengerLineup,
    engineUsed: form.engineUsed,
    model: form.model,
    regionFilter: form.regionFilter,
    typeFilter: form.typeFilter,
    restrictionFilter: form.restrictionFilter,
    validationCheck: form.validationCheck,
  };
  const enginePrediction = useMemo(
    () => safeBuildBattlePrediction(engineInputs, predictions),
    [
      engineInputs.matchId,
      engineInputs.gymLeaderName,
      engineInputs.challengerName,
      engineInputs.gymLeaderRegion,
      engineInputs.challengerRegion,
      engineInputs.gymLeaderLineup,
      engineInputs.challengerLineup,
      engineInputs.engineUsed,
      engineInputs.model,
      engineInputs.regionFilter,
      engineInputs.typeFilter,
      engineInputs.restrictionFilter,
      engineInputs.validationCheck,
      predictions,
    ],
  );
  const timestamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(380px,560px)_1fr]">
      <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-100">
              <span className="text-arena-400">⚡</span> New Battle Prediction
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
              Pre-battle intelligence capture
            </p>
          </div>
          <span className="rounded-full border border-arena-400/25 bg-arena-400/10 px-3 py-1 font-mono text-xs font-bold text-arena-400">
            #{nextMatchId(predictions)}
          </span>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-100">Battle Inputs</h3>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
                Required inputs before battle
              </p>
            </div>
            <Badge tone="default">Input</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Match ID"
              value={form.matchId || nextMatchId(predictions)}
              onChange={(value) => setForm((current) => ({ ...current, matchId: value }))}
              placeholder="Auto-generated"
              readOnly
            />
            <TextField
              label="Engine/s Used"
              value={form.engineUsed}
              onChange={(value) => setForm((current) => ({ ...current, engineUsed: value }))}
              placeholder="Team Engine, Selection Engine..."
            />
            <TextField
              label="Gym Leader Name"
              value={form.gymLeaderName}
              onChange={(value) => setForm((current) => ({ ...current, gymLeaderName: value }))}
              placeholder="e.g. Brock"
            />
            <TextField
              label="Challenger Name"
              value={form.challengerName}
              onChange={(value) => setForm((current) => ({ ...current, challengerName: value }))}
              placeholder="e.g. Ash"
            />
            <TextField
              label="Gym Leader Region and Type"
              value={form.gymLeaderRegion}
              onChange={(value) => setForm((current) => ({ ...current, gymLeaderRegion: value }))}
              placeholder="e.g. Kanto / Rock"
            />
            <TextField
              label="Challenger Region"
              value={form.challengerRegion}
              onChange={(value) => setForm((current) => ({ ...current, challengerRegion: value }))}
              placeholder="e.g. Johto"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField
              label="Gym Leader Lineup"
              value={form.gymLeaderLineup}
              onChange={(value) => setForm((current) => ({ ...current, gymLeaderLineup: value }))}
              placeholder="Pikachu, Raichu, ..."
            />
            <TextField
              label="Challenger Lineup"
              value={form.challengerLineup}
              onChange={(value) => setForm((current) => ({ ...current, challengerLineup: value }))}
              placeholder="Charizard, Gengar, ..."
            />
          </div>

          <div className="mt-4">
            <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
              Prediction Model
            </label>
            <select
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              className="w-full rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 py-3 font-display text-base text-slate-100 outline-none transition focus:border-arena-400 focus:ring-2 focus:ring-arena-400/20"
            >
              {predictionModels.map((model) => (
                <option key={model} value={model} className="bg-slate-950">
                  {model}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                { value: 'auto', label: 'Auto (Engine)' },
                { value: 'manual', label: 'Manual Override' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setForm((current) => ({ ...current, confidenceMode: option.value }))
                  }
                  className={`rounded-full border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] transition ${
                    form.confidenceMode === option.value
                      ? 'border-arena-400/60 bg-arena-400/15 text-arena-300 shadow-glow'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-arena-400/35 hover:text-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
                {form.confidenceMode === 'manual' ? 'Analyst Confidence' : 'Engine Confidence'}
              </label>
              <span className="font-display text-sm font-bold text-arena-400">
                {form.confidenceMode === 'manual' ? form.confidence : enginePrediction.confidence}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="100"
                value={form.confidence}
                disabled={form.confidenceMode !== 'manual'}
                onChange={(event) =>
                  setForm((current) => ({ ...current, confidence: Number(event.target.value) }))
                }
                className={`h-2 w-full appearance-none rounded-full bg-white/15 accent-arena-400 ${
                  form.confidenceMode !== 'manual' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                }`}
              />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <span>1%</span>
              <span>100%</span>
            </div>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
              {form.confidenceMode === 'manual'
                ? 'Manual override is active and will be saved with this prediction.'
                : 'Auto mode uses the engine confidence from the selected model.'}
            </p>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
                Predicted Winner
              </label>
              <span className="rounded-full border border-arena-400/30 bg-arena-400/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-arena-400">
                {form.confidenceMode === 'manual' ? 'Manual' : 'Auto'}
              </span>
            </div>
            <div className="rounded-2xl border border-arena-400/20 bg-arena-400/5 p-4">
              <p className="font-display text-lg font-bold text-slate-100">
                {enginePrediction.predictedWinnerName || 'Pending'}
              </p>
              <p className="mt-2 font-mono text-xs leading-5 text-slate-400">
                Generated from the matchup inputs, cached PokéAPI data, and rule-based scoring.
              </p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                {form.confidenceMode === 'manual'
                  ? 'This preview uses the manual override confidence.'
                  : 'This preview uses the engine confidence.'}
              </p>
              <p className="mt-2 font-mono text-xs leading-5 text-slate-300">
                {enginePrediction.reason}
              </p>
              {form.confidenceMode === 'manual' ? (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Manual override applied: confidence set to {form.confidence}%.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {form.confidenceMode === 'manual'
                    ? `Manual Confidence ${form.confidence}%`
                    : `Engine Confidence ${enginePrediction.confidence}%`}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Model {enginePrediction.model}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
              Analyst Note / Extra Context (Optional)
            </label>
            <textarea
              rows={5}
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Add any extra context you want saved with the engine prediction..."
              className="w-full resize-none rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 py-3 font-mono text-sm leading-6 text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-arena-400 focus:ring-2 focus:ring-arena-400/20"
            />
          </div>

          {enginePrediction.validationNotes.length ? (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 font-mono text-xs leading-5 ${
                enginePrediction.validationCheck
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                  : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
              }`}
            >
              <p className="mb-1 font-bold uppercase tracking-[0.28em]">
                {enginePrediction.validationCheck ? 'Validation check passed' : 'Validation check warning'}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {enginePrediction.validationNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <button
          onClick={onGenerate}
          disabled={isSaving}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-arena-400/50 bg-gradient-to-r from-arena-400/15 via-arena-400/10 to-transparent px-5 py-4 font-display text-lg font-bold uppercase tracking-[0.2em] text-arena-400 shadow-glow transition hover:-translate-y-0.5 hover:bg-arena-400/20"
        >
          <span>⚡</span>
          {isSaving ? 'Generating...' : 'Generate Prediction'}
        </button>
        {notice ? <p className="mt-3 font-mono text-xs leading-5 text-amber-300">{notice}</p> : null}
      </section>

      <section className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-slate-100">
                Latest Predictions
              </h2>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
                {predictions.length} total
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
              Live feed
            </div>
          </div>

          <div className="space-y-4">
            {predictions.map((battle) => (
              <PredictionCard key={battle.id} battle={battle} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function RequirementsViewExact() {
  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6">
        <h2 className="font-display text-3xl font-bold uppercase tracking-[0.08em] text-slate-100">
          X. Required System 3: Battle Prediction Engine
        </h2>
        <div className="mt-5 space-y-4 font-mono text-sm leading-7 text-slate-300">
          <p className="font-display text-2xl font-bold text-slate-100">Purpose</p>
          <p>
            The <span className="font-bold text-slate-100">Battle Prediction Engine</span> predicts the expected winner before each Pokemon Showdown battle starts.
          </p>
          <p>It should answer:</p>
          <blockquote className="border-l-4 border-white/10 pl-4 text-slate-400">
            "Given the Gym Leader's lineup and the Challenger's lineup, who is expected to win?"
          </blockquote>
          <p>
            The Battle Prediction Engine must also store the <span className="font-bold text-slate-100">ground truth</span>, meaning it must record the actual result after the battle.
          </p>
        </div>
      </section>

      <SpecSection
        title="Required Inputs Before Battle"
        description="Before each battle starts, the system must record:"
        columns={['Input', 'Description']}
        rows={specInputs}
      />

      <SpecSection
        title="Required Prediction Output Before Battle"
        description="Before each battle starts, the Battle Prediction Engine must produce and save:"
        columns={['Output', 'Description']}
        rows={specPredictionOutputs}
        footer="Important rule: Predictions must be recorded before each battle starts. Predictions encoded after the battle begins will not be counted."
      />

      <SpecSection
        title="Required Ground Truth Output After Battle"
        description="After each battle ends, the system must record:"
        columns={['Output', 'Description']}
        rows={specGroundTruthOutputs}
      />

      <SpecSection
        title="Possible Models"
        description="The Battle Prediction Engine may use:"
        columns={['Model', 'Possible Use']}
        rows={specModels}
      />

      <SpecSection
        title="Required or Suggested Metrics"
        description="The Battle Prediction Engine should compute:"
        columns={['Metric', 'Meaning']}
        rows={specMetrics}
        extraBlockTitle="If confidence scores are used, the system may also compute:"
        extraColumns={['Metric', 'Meaning']}
        extraRows={specProbabilityMetrics}
        footer="The confusion matrix should continuously update as more battles are recorded."
      />

      <SpecSection
        title="XI. REQUIRED IMPLEMENTATION RULES"
        description="Engine developers must include fields or logic for:"
        columns={['Required Field / Logic', 'Description']}
        rows={specImplementationRules}
        extraBlockTitle="Suggested output format:"
        extraColumns={['Pokemon', 'Native Region', 'Type', 'Role', 'Reason Selected']}
        extraRows={specSuggestedFormat}
        footer="The system should clearly display the Pokemon's native region in the output."
      />

      <SpecSection
        title="XII. REQUIRED SYSTEM FEATURES"
        description="Each system should have the following basic features:"
        columns={['Feature', 'Requirement']}
        rows={specSystemFeatures}
      />
    </div>
  );
}

function GroundTruthView({ form, setForm, battles, selectedBattle, onSubmit, accuracy }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(340px,520px)_1fr] xl:items-start">
      <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6 xl:sticky xl:top-32 xl:self-start">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-100">
              <span className="text-red-400">✖</span> Record Battle Result
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
              Ground truth capture after the match
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-mono text-xs font-bold text-emerald-300">
            {accuracy}% accuracy
          </span>
        </div>

        <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
          Select Match
        </label>
        <select
          value={form.matchId}
          onChange={(event) => setForm((current) => ({ ...current, matchId: event.target.value }))}
          className="w-full rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 py-3 font-display text-base text-slate-100 outline-none transition focus:border-arena-400 focus:ring-2 focus:ring-arena-400/20"
        >
          <option value="" className="bg-slate-950">
            Select match
          </option>
          {battles.map((battle) => (
            <option key={battle.id} value={battle.id} className="bg-slate-950">
              Match #{battle.id} - {battle.gymLeaderName || battle.battlerA || 'Gym Leader'} vs{' '}
              {battle.challengerName || battle.battlerB || 'Challenger'}
            </option>
          ))}
        </select>

        <div className="mt-5">
          <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            Actual Winner
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              selectedBattle?.gymLeaderName ?? selectedBattle?.battlerA ?? 'Gym Leader',
              selectedBattle?.challengerName ?? selectedBattle?.battlerB ?? 'Challenger',
            ].map((name) => (
              <button
                key={name}
                onClick={() => setForm((current) => ({ ...current, actualWinner: name }))}
                className={`rounded-2xl border px-4 py-4 font-display text-lg font-bold transition ${
                  form.actualWinner === name
                    ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300 shadow-glow'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:border-arena-400/35 hover:bg-arena-400/5'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <TextField
            label="Replay Link"
            value={form.replayLink}
            onChange={(value) => setForm((current) => ({ ...current, replayLink: value }))}
            placeholder="https://replay.pokemonshowdown.com/..."
            type="url"
            compact
          />
          <FileField
            label="Screenshot / Proof"
            fileName={form.screenshotName}
            preview={form.screenshotPreview}
            onChange={async (file) => {
              if (!file) {
                setForm((current) => ({
                  ...current,
                  screenshotFile: null,
                  screenshotPreview: '',
                  screenshotName: '',
                }));
                return;
              }

              const preview = await readFileAsDataURL(file);
              setForm((current) => ({
                ...current,
                screenshotFile: file,
                screenshotPreview: preview,
                screenshotName: file.name,
              }));
            }}
            onClear={() =>
              setForm((current) => ({
                ...current,
                screenshotFile: null,
                screenshotPreview: '',
                screenshotName: '',
              }))
            }
            compact
          />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <TextField
            label="Turns"
            value={form.turns}
            onChange={(value) => setForm((current) => ({ ...current, turns: value }))}
            placeholder="e.g. 42"
          />
          <TextField
            label="Final Score"
            value={form.finalScore}
            onChange={(value) => setForm((current) => ({ ...current, finalScore: value }))}
            placeholder="e.g. 2-0"
          />
          <TextField
            label="MVP Pokemon"
            value={form.mvp}
            onChange={(value) => setForm((current) => ({ ...current, mvp: value }))}
            placeholder="e.g. Garchomp"
          />
        </div>

        <button
          onClick={onSubmit}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-arena-400/40 bg-gradient-to-r from-arena-400/15 via-arena-400/10 to-transparent px-5 py-4 font-display text-lg font-bold uppercase tracking-[0.2em] text-arena-400 shadow-glow transition hover:-translate-y-0.5 hover:bg-arena-400/20"
        >
          <span>✓</span>
          Submit Ground Truth
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-slate-100">
              Recorded Results
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
              {battles.filter((battle) => battle.actualWinner).length} of {battles.length}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {battles.map((battle) => (
            <ResultCard key={battle.id} battle={battle} />
          ))}
        </div>
      </section>
    </div>
  );
}

function HistoryView({ accuracy, totalBattles, correctBattles, battles }) {
  const loggedBattles = battles.filter((battle) => battle.actualWinner).length;
  const pendingBattles = battles.filter((battle) => !battle.actualWinner).length;

  return (
    <div className="space-y-6">
      <section className="glass-panel grid gap-4 rounded-[28px] p-5 shadow-soft md:grid-cols-3 md:p-6">
        <MetricCard label="Total Battles" value={totalBattles} />
        <MetricCard label="Accuracy" value={`${accuracy}%`} accent />
        <MetricCard label="Correct" value={`${correctBattles}/${loggedBattles || 0}`} />
      </section>

      <section className="space-y-4">
        {battles.map((battle) => (
          <HistoryCard key={battle.id} battle={battle} />
        ))}
        {pendingBattles === battles.length ? (
          <div className="glass-panel rounded-[24px] p-6 text-center text-slate-400">
            No logged battles yet. Add ground truth data to see the accuracy timeline.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RequirementsView() {
  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-arena-400">
              X. Required System 3
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold text-slate-100">
              Battle Prediction Engine Requirements
            </h2>
            <p className="mt-2 max-w-3xl font-mono text-sm leading-6 text-slate-300">
              This section adds the missing specification content from your reference images while
              keeping the current dark UI style intact.
            </p>
          </div>
          <Badge tone="default">Spec Reference</Badge>
        </div>
      </section>

      <SpecSection
        title="Purpose"
        description="The Battle Prediction Engine predicts the expected winner before each Pokemon Showdown battle starts."
        lines={[
          'It should answer: Given the Gym Leader’s lineup and the Challenger’s lineup, who is expected to win?',
          'The engine must also store the ground truth, meaning it must record the actual result after the battle.',
        ]}
      />

      <SpecSection
        title="Required Inputs Before Battle"
        description="Before each battle starts, the system must record:"
        columns={['Input', 'Description']}
        rows={specInputs}
      />

      <SpecSection
        title="Required Prediction Output Before Battle"
        description="Before each battle starts, the Battle Prediction Engine must produce and save:"
        columns={['Output', 'Description']}
        rows={specPredictionOutputs}
        footer="Important rule: Predictions must be recorded before each battle starts. Predictions encoded after the battle begins will not be counted."
      />

      <SpecSection
        title="Required Ground Truth Output After Battle"
        description="After each battle ends, the system must record:"
        columns={['Output', 'Description']}
        rows={specGroundTruthOutputs}
      />

      <SpecSection
        title="Possible Models"
        description="The Battle Prediction Engine may use:"
        columns={['Model', 'Possible Use']}
        rows={specModels}
      />

      <SpecSection
        title="Required or Suggested Metrics"
        description="The Battle Prediction Engine should compute:"
        columns={['Metric', 'Meaning']}
        rows={specMetrics}
        extraBlockTitle="If confidence scores are used, the system may also compute:"
        extraColumns={['Metric', 'Meaning']}
        extraRows={specProbabilityMetrics}
        footer="The confusion matrix should continuously update as more battles are recorded."
      />

      <SpecSection
        title="XI. Required Implementation Rules"
        description="Engine developers must include fields or logic for:"
        columns={['Required Field / Logic', 'Description']}
        rows={specImplementationRules}
        extraBlockTitle="Suggested output format:"
        extraColumns={['Pokemon', 'Native Region', 'Type', 'Role', 'Reason Selected']}
        extraRows={specSuggestedFormat}
        footer="The system should clearly display the Pokemon's native region in the output."
      />

      <SpecSection
        title="XII. Required System Features"
        description="Each system should have the following basic features:"
        columns={['Feature', 'Requirement']}
        rows={specSystemFeatures}
      />
    </div>
  );
}

function SpecSection({
  title,
  description,
  columns = [],
  rows = [],
  lines = [],
  footer = '',
  extraBlockTitle = '',
  extraColumns = [],
  extraRows = [],
}) {
  return (
    <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6">
      <div className="mb-4">
        <h3 className="font-display text-3xl font-bold text-slate-100">{title}</h3>
        {description ? <p className="mt-2 font-mono text-sm leading-6 text-slate-300">{description}</p> : null}
      </div>

      {lines.length ? (
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm leading-6 text-slate-300">
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {columns.length > 0 && rows.length > 0 ? (
        <div className={`${lines.length ? 'mt-5' : ''} overflow-hidden rounded-2xl border border-white/10 bg-white/5`}>
          <SpecTable columns={columns} rows={rows} />
        </div>
      ) : null}

      {extraBlockTitle && extraColumns.length > 0 && extraRows.length > 0 ? (
        <div className="mt-5">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            {extraBlockTitle}
          </p>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <SpecTable columns={extraColumns} rows={extraRows} />
          </div>
        </div>
      ) : null}

      {footer ? <p className="mt-4 font-mono text-sm leading-6 text-slate-400">{footer}</p> : null}
    </section>
  );
}

function SpecTable({ columns, rows }) {
  const isSuggestedFormat = columns.length === 5;

  return (
    <table className="w-full border-collapse text-left">
      <thead className="bg-white/5">
        <tr>
          {columns.map((column) => (
            <th
              key={column}
              className="px-4 py-3 font-mono text-xs uppercase tracking-[0.3em] text-slate-300"
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={Array.isArray(row) ? row.join('|') : row} className="border-t border-white/10">
            {row.map((cell, index) => (
              <td
                key={`${cell}-${index}`}
                className={`px-4 py-3 font-mono text-sm leading-6 text-slate-300 ${
                  isSuggestedFormat && index === 4 ? 'text-slate-400' : ''
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PredictionCard({ battle }) {
  const gymLeaderName = battle.gymLeaderName || battle.battlerA || 'Gym Leader';
  const challengerName = battle.challengerName || battle.battlerB || 'Challenger';
  const predictedWinner = battle.predictedWinner || battle.actualWinner || 'Pending';
  const confidence = toConfidenceValue(battle.confidence, 0.5);

  return (
    <article
      style={{ contentVisibility: 'auto', containIntrinsicSize: '520px' }}
      className="glass-panel rounded-[24px] p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-arena-400/35"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-arena-400/25 bg-white/5 text-arena-400">
            🏆
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.32em] text-arena-400">
              Match #{battle.id}
            </div>
            <div className="mt-1 font-display text-lg font-bold text-slate-100">
              {gymLeaderName} <span className="text-red-400">VS</span> {challengerName}
            </div>
          </div>
        </div>
        <Badge>{battle.model}</Badge>
      </div>

      {battle.gymLeaderName || battle.challengerName || battle.engineUsed ? (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
          {battle.gymLeaderName ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Gym Leader: {battle.gymLeaderName}
            </span>
          ) : null}
          {battle.challengerName ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Challenger: {battle.challengerName}
            </span>
          ) : null}
          {battle.engineUsed ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Engine: {battle.engineUsed}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <NameTile label="Gym Leader" name={gymLeaderName} highlighted={predictedWinner === gymLeaderName} />
        <div className="text-center font-display text-2xl font-bold text-red-400">VS</div>
        <NameTile label="Challenger" name={challengerName} highlighted={predictedWinner === challengerName} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Confidence</span>
          <span className="text-arena-400">{Math.round(confidence * 100)}%</span>
        </div>
        <div className="h-3 rounded-full bg-white/10">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-arena-300 via-arena-400 to-arena-100 shadow-[0_0_20px_rgba(255,215,0,0.35)]"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          Prediction Reason
        </div>
        <p className="font-mono text-sm leading-6 text-slate-300">{battle.reason}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-400">
        <span>{battle.timestamp}</span>
        {battle.actualWinner ? (
          <span className="rounded-full bg-emerald-400/10 px-2 py-1 font-bold text-emerald-300">
            Resolved
          </span>
        ) : (
          <span className="rounded-full bg-amber-400/10 px-2 py-1 font-bold text-amber-300">
            Pending
          </span>
        )}
      </div>
    </article>
  );
}

function ResultCard({ battle }) {
  return <BattleResultCard battle={battle} />;

  const statusCorrect = battle.actualWinner && battle.actualWinner === battle.predictedWinner;
  const gymLeaderName = battle.gymLeaderName || battle.battlerA || 'Gym Leader';
  const challengerName = battle.challengerName || battle.battlerB || 'Challenger';
  const predictedWinner = battle.predictedWinner || battle.actualWinner || 'Pending';
  const confidence = toConfidenceValue(battle.confidence, 0.5);

  return (
    <article
      style={{ contentVisibility: 'auto', containIntrinsicSize: '620px' }}
      className={`glass-panel rounded-[24px] p-5 shadow-soft transition hover:-translate-y-0.5 ${
        battle.actualWinner
          ? statusCorrect
            ? 'ring-1 ring-emerald-400/20'
            : 'ring-1 ring-rose-400/20'
          : 'ring-1 ring-amber-400/15'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.32em] text-arena-400">
            Match #{battle.id}
          </div>
          <div className="mt-1 font-display text-xl font-bold text-slate-100">
            {gymLeaderName} vs {challengerName}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{battle.model}</Badge>
          <Badge tone={battle.actualWinner ? (statusCorrect ? 'success' : 'danger') : 'warning'}>
            {battle.actualWinner ? (statusCorrect ? 'Prediction Correct' : 'Prediction Missed') : 'Pending'}
          </Badge>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
              Battle Outcome
            </div>
            <div className="mt-1 font-display text-xl font-bold text-slate-100">
              {battle.actualWinner ? `${battle.actualWinner} takes the win` : 'Awaiting ground truth'}
            </div>
          </div>
          <div
            className={`rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] ${
              battle.actualWinner
                ? statusCorrect
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-rose-400/15 text-rose-300'
                : 'bg-amber-400/15 text-amber-300'
            }`}
          >
            {battle.actualWinner ? (statusCorrect ? 'Prediction Correct' : 'Prediction Missed') : 'Pending'}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <InfoBlock label="Predicted Winner" value={predictedWinner} accent />
        <InfoBlock label="Actual Winner" value={battle.actualWinner || 'Pending'} success={Boolean(battle.actualWinner)} />
        <InfoBlock label="MVP" value={battle.mvp || 'Pending'} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Confidence</span>
          <span className="text-arena-400">{Math.round(confidence * 100)}%</span>
        </div>
        <div className="h-3 rounded-full bg-white/10">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-arena-300 via-arena-400 to-arena-100 shadow-[0_0_20px_rgba(255,215,0,0.35)]"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-emerald-300">
          Battle Summary
        </div>
        <div className="mt-2 font-display text-lg font-bold text-emerald-100">
          Winner: {battle.actualWinner || predictedWinner}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            {gymLeaderName} Team
          </div>
          <p className="mt-2 font-mono text-sm leading-6 text-slate-300">
            {battle.gymLeaderLineup || 'Pending'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            {challengerName} Team
          </div>
          <p className="mt-2 font-mono text-sm leading-6 text-slate-300">
            {battle.challengerLineup || 'Pending'}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300">
          Quick Access
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {battle.replayLink ? (
            <a
              href={battle.replayLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-cyan-400/40 bg-cyan-400/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-cyan-200 transition hover:bg-cyan-400/25"
            >
              Open Replay Site
            </a>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
              Replay pending
            </span>
          )}

          {battle.screenshotPreview ? (
            <a
              href={battle.screenshotPreview}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/25"
            >
              View Screenshot
            </a>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
              Screenshot pending
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Winner Summary
          </div>
          <p className="mt-2 font-display text-lg font-bold text-slate-100">
            {battle.actualWinner
              ? `${battle.actualWinner} outlasted ${battle.actualWinner === gymLeaderName ? challengerName : gymLeaderName}`
              : 'No final result recorded yet'}
          </p>
          <p className="mt-2 font-mono text-xs leading-5 text-slate-400">
            {battle.reason || 'Prediction reason not saved yet.'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            MVP Spotlight
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-2xl">
              ⭐
            </div>
            <div>
              <div className="font-display text-lg font-bold text-amber-200">
                {battle.mvp || 'Pending'}
              </div>
              <div className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Most impactful Pokémon
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <span>{battle.turns ? `${battle.turns} turns` : 'Turns pending'}</span>
        <span>{battle.finalScore || 'Score pending'}</span>
        {battle.replayLink ? (
          <a
            href={battle.replayLink}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-200"
          >
            View Replay
          </a>
        ) : null}
        {battle.screenshotName ? <span className="text-slate-500">{battle.screenshotName}</span> : null}
      </div>

      {battle.screenshotPreview ? (
        <a
          href={battle.screenshotPreview}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50"
        >
          <img
            src={battle.screenshotPreview}
            alt={battle.screenshotName || `Proof for match ${battle.id}`}
            className="h-48 w-full object-cover"
          />
        </a>
      ) : null}

      <p className="mt-4 font-mono text-sm leading-6 text-slate-300">{battle.reason}</p>
    </article>
  );
}

function HistoryCard({ battle }) {
  return <BattleResultCard battle={battle} />;

  const statusCorrect = battle.actualWinner && battle.actualWinner === battle.predictedWinner;
  const gymLeaderName = battle.gymLeaderName || battle.battlerA || 'Gym Leader';
  const challengerName = battle.challengerName || battle.battlerB || 'Challenger';
  const predictedWinner = battle.predictedWinner || battle.actualWinner || 'Pending';
  const confidence = toConfidenceValue(battle.confidence, 0.5);

  return (
    <article
      style={{ contentVisibility: 'auto', containIntrinsicSize: '620px' }}
      className={`glass-panel rounded-[24px] p-5 shadow-soft ${
        battle.actualWinner
          ? statusCorrect
            ? 'ring-1 ring-emerald-400/15'
            : 'ring-1 ring-rose-400/15'
          : 'ring-1 ring-amber-400/10'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.32em] text-arena-400">
            #{battle.id}
          </div>
          <div className="mt-1 font-display text-xl font-bold text-slate-100">
            {gymLeaderName} vs {challengerName}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{battle.model}</Badge>
          <Badge tone={battle.actualWinner ? (statusCorrect ? 'success' : 'danger') : 'warning'}>
            {battle.actualWinner ? (statusCorrect ? 'Correct' : 'Missed') : 'Pending'}
          </Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Predicted Winner
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-arena-400">
            {predictedWinner}
          </div>
        </div>
        <div className="hidden text-center font-display text-2xl font-bold text-red-400 md:block">VS</div>
        <div className="text-right md:text-left">
          <div className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Actual Winner
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-emerald-300">
            {battle.actualWinner || 'Pending'}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
              Battle Outcome
            </div>
            <div className="mt-1 font-display text-xl font-bold text-slate-100">
              {battle.actualWinner ? `${battle.actualWinner} won this battle` : 'Awaiting final result'}
            </div>
          </div>
          <div
            className={`rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] ${
              battle.actualWinner
                ? statusCorrect
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-rose-400/15 text-rose-300'
                : 'bg-amber-400/15 text-amber-300'
            }`}
          >
            {battle.actualWinner ? (statusCorrect ? 'Correct' : 'Missed') : 'Pending'}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Winner Summary
          </div>
          <p className="mt-2 font-display text-lg font-bold text-slate-100">
            {battle.actualWinner
              ? `${battle.actualWinner} over ${battle.actualWinner === gymLeaderName ? challengerName : gymLeaderName}`
              : 'No resolved battle yet'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            MVP Spotlight
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-lg">
              ⭐
            </div>
            <div className="font-display text-base font-bold text-amber-200">
              {battle.mvp || 'Pending'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Confidence</span>
          <span className="text-arena-400">{Math.round(confidence * 100)}%</span>
        </div>
        <div className="h-3 rounded-full bg-white/10">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-arena-300 via-arena-400 to-arena-100 shadow-[0_0_20px_rgba(255,215,0,0.35)]"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-emerald-300">
          Battle Summary
        </div>
        <div className="mt-2 font-display text-lg font-bold text-emerald-100">
          Winner: {battle.actualWinner || predictedWinner}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            {gymLeaderName} Team
          </div>
          <p className="mt-2 font-mono text-sm leading-6 text-slate-300">
            {battle.gymLeaderLineup || 'Pending'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            {challengerName} Team
          </div>
          <p className="mt-2 font-mono text-sm leading-6 text-slate-300">
            {battle.challengerLineup || 'Pending'}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300">
          Quick Access
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {battle.replayLink ? (
            <a
              href={battle.replayLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-cyan-400/40 bg-cyan-400/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-cyan-200 transition hover:bg-cyan-400/25"
            >
              Open Replay Site
            </a>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
              Replay pending
            </span>
          )}

          {battle.screenshotPreview ? (
            <a
              href={battle.screenshotPreview}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/25"
            >
              View Screenshot
            </a>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
              Screenshot pending
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>{battle.turns ? `${battle.turns} turns` : 'Turns pending'}</span>
        <span>{battle.finalScore || 'Score pending'}</span>
        {battle.mvp ? <span>MVP: {battle.mvp}</span> : null}
        {battle.replayLink ? (
          <a
            href={battle.replayLink}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-200"
          >
            Replay
          </a>
        ) : null}
        {battle.screenshotName ? <span className="text-slate-500">{battle.screenshotName}</span> : null}
      </div>

      <p className="mt-4 font-mono text-sm leading-6 text-slate-300">{battle.reason}</p>
      {battle.screenshotPreview ? (
        <a
          href={battle.screenshotPreview}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50"
        >
          <img
            src={battle.screenshotPreview}
            alt={`Proof for match ${battle.id}`}
            className="max-h-72 w-full object-cover"
          />
        </a>
      ) : null}
    </article>
  );
}

function BattleResultCard({ battle }) {
  const statusCorrect = Boolean(battle.actualWinner && battle.actualWinner === battle.predictedWinner);
  const gymLeaderName = battle.gymLeaderName || battle.battlerA || 'Gym Leader';
  const challengerName = battle.challengerName || battle.battlerB || 'Challenger';
  const predictedWinner = battle.predictedWinner || 'Pending';
  const actualWinner = battle.actualWinner || 'Pending';
  const confidence = toConfidenceValue(battle.confidence, 0.5);
  const confidencePercent = Math.round(confidence * 100);
  const statusTone = battle.actualWinner ? (statusCorrect ? 'success' : 'danger') : 'warning';
  const statusLabel = battle.actualWinner ? (statusCorrect ? 'Correct' : 'Missed') : 'Pending';
  const outcomeText = battle.actualWinner
    ? `${battle.actualWinner} won this battle`
    : 'Awaiting final result';

  return (
    <article
      style={{ contentVisibility: 'auto', containIntrinsicSize: '620px' }}
      className={`glass-panel mx-auto w-full max-w-5xl rounded-[24px] p-5 shadow-soft transition hover:-translate-y-0.5 md:p-6 ${
        battle.actualWinner
          ? statusCorrect
            ? 'ring-1 ring-emerald-400/20'
            : 'ring-1 ring-rose-400/20'
          : 'ring-1 ring-amber-400/15'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-xs uppercase tracking-[0.32em] text-arena-400">
            Match #{battle.id}
          </div>
          <div className="mt-1 break-words font-display text-xl font-bold text-slate-100 md:text-2xl">
            {gymLeaderName} vs {challengerName}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{battle.model || 'Model Pending'}</Badge>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </div>
      </div>

      <section className="mx-auto mt-6 max-w-4xl rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5">
        <div className="grid gap-5 text-center md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
          <ResultSide label="Predicted Winner" value={predictedWinner} tone="predicted" />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-400/30 bg-red-400/10 font-display text-sm font-bold text-red-300">
            VS
          </div>
          <ResultSide label="Actual Winner" value={actualWinner} tone={battle.actualWinner ? 'actual' : 'pending'} />
        </div>
      </section>

      <section className="mx-auto mt-5 flex max-w-4xl flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-center md:flex-row">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Battle Outcome
          </div>
          <div className="mt-1 break-words font-display text-xl font-bold text-slate-100">
            {outcomeText}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] ${
            battle.actualWinner
              ? statusCorrect
                ? 'bg-emerald-400/15 text-emerald-300'
                : 'bg-rose-400/15 text-rose-300'
              : 'bg-amber-400/15 text-amber-300'
          }`}
        >
          {statusLabel}
        </span>
      </section>

      <div className="mx-auto mt-5 grid max-w-4xl gap-3 md:grid-cols-3">
        <ResultMetaItem label="Winner" value={actualWinner} tone={battle.actualWinner ? 'success' : 'default'} />
        <ResultMetaItem label="MVP" value={battle.mvp || 'Pending'} tone="accent" />
        <ResultMetaItem label="Score" value={battle.finalScore || 'Pending'} />
      </div>

      <div className="mx-auto mt-5 max-w-3xl">
        <div className="mb-2 flex items-center justify-between gap-4 font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Confidence</span>
          <span className="text-arena-400">{confidencePercent}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-arena-300 via-arena-400 to-arena-100 shadow-[0_0_20px_rgba(255,215,0,0.35)]"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ResultDetail label={`${gymLeaderName} Team`} value={battle.gymLeaderLineup || 'Pending'} />
        <ResultDetail label={`${challengerName} Team`} value={battle.challengerLineup || 'Pending'} />
        <ResultDetail
          label="Prediction Notes"
          value={battle.reason || 'Prediction reason not saved yet.'}
          wide
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-400">
        <span>{battle.turns ? `${battle.turns} turns` : 'Turns pending'}</span>
        {battle.mvp ? <span>MVP: {battle.mvp}</span> : null}
        {battle.screenshotName ? <span className="text-slate-500">{battle.screenshotName}</span> : null}
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {battle.replayLink ? (
          <a
            href={battle.replayLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-cyan-400/40 bg-cyan-400/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-cyan-200 transition hover:bg-cyan-400/25"
          >
            Open Replay
          </a>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
            Replay pending
          </span>
        )}

        {battle.screenshotPreview ? (
          <a
            href={battle.screenshotPreview}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/25"
          >
            View Screenshot
          </a>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
            Screenshot pending
          </span>
        )}
      </div>

      {battle.screenshotPreview ? (
        <a
          href={battle.screenshotPreview}
          target="_blank"
          rel="noreferrer"
          className="mx-auto mt-5 block max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50"
        >
          <img
            src={battle.screenshotPreview}
            alt={battle.screenshotName || `Proof for match ${battle.id}`}
            className="max-h-72 w-full object-cover"
          />
        </a>
      ) : null}
    </article>
  );
}

function ResultSide({ label, value, tone }) {
  const toneClass =
    tone === 'predicted'
      ? 'text-arena-400'
      : tone === 'actual'
        ? 'text-emerald-300'
        : 'text-slate-300';

  return (
    <div className="min-w-0">
      <div className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 break-words font-display text-2xl font-bold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function ResultMetaItem({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-200'
      : tone === 'accent'
        ? 'text-amber-200'
        : 'text-slate-100';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 break-words font-display text-lg font-bold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function ResultDetail({ label, value, wide = false }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <p className="mt-2 break-words font-mono text-sm leading-6 text-slate-300">
        {value}
      </p>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text', compact = false, readOnly = false }) {
  return (
    <label className="block">
      <span className="mb-2 block min-h-[2.5rem] font-mono text-xs uppercase leading-5 tracking-[0.28em] text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 ${
          compact ? 'py-2.5' : 'py-3'
        } font-display text-base text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-arena-400 focus:ring-2 focus:ring-arena-400/20 ${readOnly ? 'cursor-not-allowed opacity-80' : ''}`}
      />
    </label>
  );
}

function FileField({ label, fileName, preview, onChange, onClear, compact = false }) {
  const inputRef = useRef(null);

  function handleClear() {
    if (inputRef.current) {
      inputRef.current.value = '';
    }

    onClear?.();
  }

  return (
    <div className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
        {label}
      </span>
      <div className={`rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 ${compact ? 'py-3' : 'py-4'}`}>
        <input
          ref={inputRef}
          id="screenshot-proof-upload"
          type="file"
          accept="image/*"
          onChange={(event) => onChange(event.target.files?.[0] || null)}
          className="sr-only"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="screenshot-proof-upload"
            className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-arena-400/50 bg-arena-400 px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_22px_rgba(255,215,0,0.22)] transition hover:-translate-y-0.5 hover:bg-arena-300"
          >
            <span>Upload Screenshot</span>
          </label>

          <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 ${compact ? 'py-2.5' : 'py-3'} font-mono text-sm text-slate-300`}>
            <span className="block min-w-0 flex-1 truncate">{fileName || 'No file chosen'}</span>
            {fileName ? (
              <button
                type="button"
                onClick={handleClear}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400/30 bg-red-400/10 text-red-300 transition hover:bg-red-400/20 hover:text-red-200"
                aria-label="Clear selected screenshot"
                title="Clear selected screenshot"
              >
                x
              </button>
            ) : null}
          </div>
        </div>

        <div className={`mt-3 font-mono text-[11px] uppercase tracking-[0.26em] text-slate-500 ${compact ? 'leading-4' : ''}`}>
          PNG, JPG, WEBP or other image format
        </div>

        {preview ? (
          <img
            src={preview}
            alt="Screenshot proof preview"
            className="mt-3 max-h-44 w-full rounded-2xl border border-white/10 object-cover"
          />
        ) : null}
      </div>
    </div>
  );
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function MetricCard({ label, value, accent = false }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-6 text-center">
      <div className="font-mono text-xs uppercase tracking-[0.32em] text-slate-400">{label}</div>
      <div className={`mt-3 font-display text-4xl font-bold ${accent ? 'text-emerald-300' : 'text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

function InfoBlock({ label, value, accent = false, success = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div
        className={`mt-2 font-display text-2xl font-bold ${
          success ? 'text-emerald-300' : accent ? 'text-arena-400' : 'text-slate-100'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function NameTile({ label, name, highlighted }) {
  return (
    <div
      className={`rounded-[22px] border px-4 py-6 text-center transition ${
        highlighted
          ? 'border-arena-400/60 bg-arena-400/10 shadow-glow'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="font-display text-xl font-bold text-slate-100">{name}</div>
      <div className="mt-2 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">{label}</div>
    </div>
  );
}

function StatBadge({ label, value }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-[0.42em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-emerald-300">{value}</div>
    </div>
  );
}

function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'border border-white/10 bg-white/5 text-arena-400',
    success: 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    warning: 'border border-amber-400/20 bg-amber-400/10 text-amber-300',
    danger: 'border border-red-400/20 bg-red-400/10 text-red-300',
  };

  return (
    <span className={`rounded-full px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.22em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function LightningIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 2L4 14h6l-1 8 9-12h-6l1-8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SwordsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 19l4-4m0 0 3 3m-3-3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 5l-4 4m0 0-3-3m3 3-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BookIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 0 4 22V6.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h7M8 12h7M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DocumentIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 3.5h7l5 5V20.5A1.5 1.5 0 0 1 17.5 22h-10A1.5 1.5 0 0 1 6 20.5v-15A1.5 1.5 0 0 1 7.5 4H7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 3.8V8h4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 11h6M9 14.5h6M9 18h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 17V13M11 17V9M15 17V11M19 17V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3l8 4v5c0 5-3.5 8.25-8 10-4.5-1.75-8-5-8-10V7l8-4Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS VIEW — Confusion Matrix + ML Metrics (from battles table)
// ══════════════════════════════════════════════════════════════════════════════
function AnalyticsView({ metrics, isLoading, predictions, modelFilter, setModelFilter, onRefresh }) {
  useEffect(() => { onRefresh(); }, []);

  const availableModels = useMemo(() => getAvailableModels(predictions), [predictions]);
  const filteredBattles = useMemo(
    () =>
      modelFilter === 'all'
        ? predictions
        : predictions.filter((battle) => normalizeModelName(battle.model) === normalizeModelName(modelFilter)),
    [predictions, modelFilter],
  );
  const resolved = filteredBattles.filter((battle) => battle.actualWinner);
  const localFilteredMetrics = useMemo(() => calculateLocalMetrics(filteredBattles), [filteredBattles]);
  const displayMetrics = modelFilter === 'all' ? (metrics ?? localFilteredMetrics) : localFilteredMetrics;
  const tp = displayMetrics?.tp ?? 0;
  const fp = displayMetrics?.fp ?? 0;
  const fn = displayMetrics?.fn ?? 0;
  const tn = displayMetrics?.tn ?? 0;
  const modelLabel = modelFilter === 'all' ? 'All Models' : modelFilter;

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-[28px] border border-arena-400/20 p-5 shadow-soft md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-100">📊 Analytics Dashboard</h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
              Live ML metrics from Supabase battles table
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="rounded-2xl border border-arena-400/40 bg-arena-400/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-arena-400 transition hover:bg-arena-400/20"
          >
            {isLoading ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {availableModels.map((model) => {
            const count =
              model === 'all'
                ? predictions.length
                : predictions.filter((battle) => normalizeModelName(battle.model) === normalizeModelName(model)).length;
            const active = modelFilter === model;
            return (
              <button
                key={model}
                onClick={() => setModelFilter(model)}
                className={`rounded-full px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.24em] transition ${
                  active
                    ? 'border border-arena-400/60 bg-arena-400/15 text-arena-300 shadow-glow'
                    : 'border border-white/10 bg-white/5 text-slate-400 hover:border-arena-400/30 hover:text-slate-200'
                }`}
              >
                {model === 'all' ? 'All Models' : model}
                <span className="ml-2 rounded-full bg-black/25 px-2 py-0.5 text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ML Metric Cards */}
      <section className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Accuracy" value={displayMetrics ? `${displayMetrics.accuracy_pct}%` : '—'} accent />
        <MetricCard label="Precision" value={displayMetrics ? `${displayMetrics.precision_pct ?? '—'}%` : '—'} />
        <MetricCard label="Recall" value={displayMetrics ? `${displayMetrics.recall_pct ?? '—'}%` : '—'} />
        <MetricCard label="F1-Score" value={displayMetrics ? `${displayMetrics.f1_pct ?? '—'}%` : '—'} />
      </section>

      {/* Confusion Matrix */}
      <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6">
        <h3 className="mb-4 font-display text-lg font-bold uppercase tracking-[0.15em] text-slate-100">
          Confusion Matrix
        </h3>
        <div className="mx-auto max-w-md">
          <div className="mb-2 text-center font-mono text-xs uppercase tracking-[0.3em] text-slate-400">Predicted</div>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-1">
            <div />
            <div className="text-center font-mono text-xs uppercase tracking-[0.2em] text-arena-400 py-2">Positive</div>
            <div className="text-center font-mono text-xs uppercase tracking-[0.2em] text-arena-400 py-2">Negative</div>

            <div className="flex items-center pr-3 font-mono text-xs uppercase tracking-[0.2em] text-emerald-400" style={{writingMode:'vertical-lr',transform:'rotate(180deg)'}}>Actual</div>
            <div className="rounded-tl-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-emerald-400">TP</div>
              <div className="mt-1 font-display text-3xl font-bold text-emerald-300">{tp}</div>
            </div>
            <div className="rounded-tr-2xl border border-red-400/30 bg-red-400/10 p-4 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-red-400">FN</div>
              <div className="mt-1 font-display text-3xl font-bold text-red-300">{fn}</div>
            </div>

            <div />
            <div className="rounded-bl-2xl border border-red-400/30 bg-red-400/10 p-4 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-red-400">FP</div>
              <div className="mt-1 font-display text-3xl font-bold text-red-300">{fp}</div>
            </div>
            <div className="rounded-br-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-emerald-400">TN</div>
              <div className="mt-1 font-display text-3xl font-bold text-emerald-300">{tn}</div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center font-mono text-xs text-slate-500">
          {displayMetrics?.total_battles ?? 0} resolved battles · {displayMetrics?.correct ?? 0} correct predictions · {modelLabel}
        </p>
      </section>

      {/* Confidence per Battle Bar Chart */}
      {resolved.length > 0 ? (
        <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6">
          <h3 className="mb-4 font-display text-lg font-bold uppercase tracking-[0.15em] text-slate-100">
            Confidence per Battle
          </h3>
          <div className="space-y-2">
            {resolved.slice(0, 20).map((b) => {
              const conf = Math.round(toConfidenceValue(b.confidence, 0.5) * 100);
              const correct = b.actualWinner === b.predictedWinner;
              return (
                <div key={b.id} className="flex items-center gap-3">
                  <span className="w-16 text-right font-mono text-xs text-slate-400">#{b.id}</span>
                  <div className="flex-1 h-5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${correct ? 'bg-emerald-400/60' : 'bg-red-400/60'}`}
                      style={{ width: `${conf}%` }}
                    />
                  </div>
                  <span className={`w-12 text-right font-mono text-xs font-bold ${correct ? 'text-emerald-400' : 'text-red-400'}`}>
                    {conf}%
                  </span>
                  <span className="w-5 text-center">{correct ? '✓' : '✗'}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG VIEW — Timestamped trail of all system changes
// ══════════════════════════════════════════════════════════════════════════════
function AuditLogView({ auditLog, isLoading, onRefresh }) {
  useEffect(() => { onRefresh(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">🛡️ Audit Log</h2>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
            {auditLog.length} entries · Timestamped change trail
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-2xl border border-arena-400/40 bg-arena-400/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-arena-400 transition hover:bg-arena-400/20"
        >
          {isLoading ? 'Loading...' : '↻ Refresh'}
        </button>
      </div>

      {auditLog.length === 0 ? (
        <div className="glass-panel rounded-[24px] p-6 text-center text-slate-400">
          {isLoading ? 'Loading audit log...' : 'No audit entries yet. Create a prediction to see the trail.'}
        </div>
      ) : (
        <div className="space-y-3">
          {auditLog.map((entry) => {
            const isInsert = (entry.action_done || '').includes('INSERT');
            return (
              <article key={entry.audit_id} className="glass-panel rounded-[20px] p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                      isInsert ? 'bg-emerald-400/15 text-emerald-400' : 'bg-amber-400/15 text-amber-400'
                    }`}>
                      {isInsert ? '+' : '✎'}
                    </span>
                    <div>
                      <div className="font-display text-sm font-bold text-slate-100">
                        {entry.action_done}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        Match: {entry.affected_record || '—'} · By: {entry.user_or_operator || 'System'}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-slate-500">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;

