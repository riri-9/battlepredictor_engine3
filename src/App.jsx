import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  isBackendConfigured,
  loadBattles,
  nextMatchId,
  toDisplayBattle,
  toGroundTruthPayload,
  toPredictionPayload,
  saveGroundTruth,
  savePrediction,
} from './lib/backend';

const initialPredictions = [
  {
    id: '002',
    battlerA: 'MistyWater',
    battlerB: 'BrockSteel',
    predictedWinner: 'MistyWater',
    confidence: 0.61,
    reason:
      "Water-type coverage dominates Brock's Rock/Ground-heavy team. Misty's speed tier pressures early.",
    model: 'Logistic Regression',
    timestamp: 'May 28, 2026, 11:42 AM',
    actualWinner: null,
    turns: null,
    finalScore: null,
    mvp: null,
    replayLink: '',
    screenshotPreview: '',
    screenshotName: '',
  },
  {
    id: '001',
    battlerA: 'AshKetchum',
    battlerB: 'GaryOak',
    predictedWinner: 'AshKetchum',
    confidence: 0.72,
    reason:
      "Ash's team has superior speed tier with Pikachu and Charizard leading, plus effective coverage against Gary's bulky core.",
    model: 'Random Forest',
    timestamp: 'May 28, 2026, 10:15 AM',
    actualWinner: 'AshKetchum',
    turns: 38,
    finalScore: '2-0',
    mvp: 'Pikachu',
    replayLink: 'https://replay.pokemonshowdown.com/battle_001',
    screenshotPreview: '',
    screenshotName: 'battle_001_final.png',
  },
];

const predictionModels = [
  'Decision Tree',
  'Random Forest',
  'K-NN',
  'Naive Bayes',
  'Logistic Regression',
  'Rule-Based Classifier',
];

const tabs = [
  { id: 'predict', label: 'Predict', icon: LightningIcon },
  { id: 'groundTruth', label: 'Ground Truth', icon: SwordsIcon },
  { id: 'history', label: 'History', icon: BookIcon },
];

function App() {
  const [activeTab, setActiveTab] = useState('predict');
  const [predictions, setPredictions] = useState(initialPredictions);
  const [syncStatus, setSyncStatus] = useState(isBackendConfigured() ? 'connecting' : 'local');
  const [syncMessage, setSyncMessage] = useState(
    isBackendConfigured()
      ? 'Connecting to SQLite backend...'
      : 'Local draft mode. Configure VITE_API_BASE_URL to connect SQLite-backed APIs.',
  );
  const [isSavingPrediction, setIsSavingPrediction] = useState(false);
  const [isSavingGroundTruth, setIsSavingGroundTruth] = useState(false);
  const [predictionForm, setPredictionForm] = useState({
    battlerA: '',
    battlerB: '',
    predictedWinnerSide: 'A',
    confidence: 70,
    model: 'Random Forest',
    reason:
      'Type advantage, speed tier, and team balance suggest a strong early and mid-game edge.',
  });
  const [truthForm, setTruthForm] = useState({
    matchId: '002',
    actualWinner: 'MistyWater',
    replayLink: '',
    screenshotFile: null,
    screenshotPreview: '',
    screenshotName: '',
    turns: '',
    finalScore: '',
    mvp: '',
  });

  const totalBattles = predictions.length;
  const correctBattles = predictions.filter(
    (battle) => battle.actualWinner && battle.actualWinner === battle.predictedWinner,
  ).length;
  const loggedBattles = predictions.filter((battle) => battle.actualWinner).length;
  const accuracy = loggedBattles ? Math.round((correctBattles / loggedBattles) * 100) : 0;
  const pendingBattles = predictions.filter((battle) => !battle.actualWinner);

  const selectedBattle = predictions.find((battle) => battle.id === truthForm.matchId) ?? predictions[0];

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
      actualWinner: selectedBattle.actualWinner || selectedBattle.predictedWinner,
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
            setSyncMessage('SQLite backend connected. No saved battles yet.');
          }
          return;
        }

        const normalized = records.map(toDisplayBattle);
        setPredictions(normalized);
        setTruthForm((current) => ({
          ...current,
          matchId: normalized[0]?.id ?? current.matchId,
          actualWinner: normalized[0]?.actualWinner || normalized[0]?.predictedWinner || current.actualWinner,
          replayLink: normalized[0]?.replayLink || '',
          screenshotPreview: normalized[0]?.screenshotPreview || '',
          screenshotName: normalized[0]?.screenshotName || '',
        }));
        setSyncStatus('connected');
        setSyncMessage('SQLite backend connected and battle records loaded.');
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
    const matchId = nextMatchId(predictions);
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const payload = toPredictionPayload({
      form: predictionForm,
      matchId,
      timestamp,
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
        ...localBattle,
        ...record,
        id: String(record.id || record.match_id || localBattle.id),
      };

      setPredictions((current) => [finalBattle, ...current.filter((battle) => battle.id !== finalBattle.id)]);
      setTruthForm((current) => ({
        ...current,
        matchId: finalBattle.id,
        actualWinner: finalBattle.predictedWinner,
      }));
      setActiveTab('predict');
      setPredictionForm((current) => ({
        ...current,
        battlerA: '',
        battlerB: '',
      }));
      setSyncStatus(isBackendConfigured() ? 'connected' : 'local');
      setSyncMessage(isBackendConfigured() ? 'Prediction saved to SQLite backend.' : 'Prediction saved locally.');
    } catch (error) {
      setPredictions((current) => [localBattle, ...current.filter((battle) => battle.id !== localBattle.id)]);
      setTruthForm((current) => ({
        ...current,
        matchId: localBattle.id,
        actualWinner: localBattle.predictedWinner,
      }));
      setActiveTab('predict');
      setPredictionForm((current) => ({
        ...current,
        battlerA: '',
        battlerB: '',
      }));
      setSyncStatus('fallback');
      setSyncMessage('Backend save failed. Kept the prediction locally.');
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

    const currentBattle = predictions.find((battle) => battle.id === truthForm.matchId);
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
        ...(currentBattle || {}),
        ...record,
        id: String(record.id || record.match_id || truthForm.matchId),
        actualWinner: payload.actual_winner,
        replayLink: payload.replay_link,
        screenshotPreview:
          record.screenshotPreview || record.screenshot_or_photo_link || screenshotPreview,
        screenshotName: record.screenshotName || record.screenshot_filename || screenshotName,
        turns: payload.number_of_turns,
        finalScore: payload.final_score,
        mvp: payload.mvp_pokemon,
      };

      setPredictions((current) =>
        current.map((battle) => (battle.id === truthForm.matchId ? updatedBattle : battle)),
      );
      setActiveTab('groundTruth');
      setTruthForm((current) => ({
        ...current,
        screenshotFile: null,
        screenshotPreview: updatedBattle.screenshotPreview,
        screenshotName: updatedBattle.screenshotName,
      }));
      setSyncStatus(isBackendConfigured() ? 'connected' : 'local');
      setSyncMessage(
        isBackendConfigured()
          ? 'Ground truth saved to SQLite backend.'
          : 'Ground truth saved locally.',
      );
    } catch (error) {
      const updatedBattle = {
        ...(currentBattle || {}),
        actualWinner: truthForm.actualWinner,
        replayLink: truthForm.replayLink.trim(),
        screenshotPreview,
        screenshotName,
        turns: truthForm.turns ? Number(truthForm.turns) : null,
        finalScore: truthForm.finalScore.trim(),
        mvp: truthForm.mvp.trim(),
        correctPrediction: currentBattle ? currentBattle.predictedWinner === truthForm.actualWinner : null,
      };

      setPredictions((current) =>
        current.map((battle) => (battle.id === truthForm.matchId ? updatedBattle : battle)),
      );
      setActiveTab('groundTruth');
      setTruthForm((current) => ({
        ...current,
        screenshotFile: null,
        screenshotPreview,
        screenshotName,
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
      <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-arena-400/10 blur-3xl animate-drift" />
      <div className="pointer-events-none absolute right-0 top-24 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl animate-drift" />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-arena-400/15 bg-[#05050d]/72 px-4 py-4 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-arena-400/40 bg-gradient-to-br from-red-500 via-red-400 to-arena-400 shadow-glow">
              <div className="h-4 w-4 rounded-full border-2 border-slate-950/80 bg-arena-400" />
            </div>
            <div>
              <div className="font-display text-xl font-bold uppercase tracking-[0.18em] text-arena-400 md:text-2xl">
                Battle Predictor
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.45em] text-slate-400 md:text-xs">
                Engine 3 - Pokemon Showdown
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-right md:flex">
            <StatBadge label="Overall Accuracy" value={`${accuracy}%`} />
            <StatBadge label="Battles Logged" value={`${totalBattles}`} />
            <div className="text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.42em] text-slate-500">
                Sync
              </div>
              <div
                className={`mt-1 inline-flex rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em] ${
                  syncStatus === 'connected'
                    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                    : syncStatus === 'fallback'
                      ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
                      : 'border-white/10 bg-white/5 text-slate-300'
                }`}
              >
                {syncStatus === 'connected'
                  ? 'SQLite'
                  : syncStatus === 'fallback'
                    ? 'Local Fallback'
                    : 'Local Draft'}
              </div>
            </div>
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
        <div className="mb-6 rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs uppercase tracking-[0.24em] text-slate-400">
          {syncMessage}
        </div>

        {activeTab === 'predict' ? (
          <PredictView
            form={predictionForm}
            setForm={setPredictionForm}
            predictions={predictions}
            onGenerate={createPrediction}
            isSaving={isSavingPrediction}
          />
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
      </main>
    </div>
  );
}

function PredictView({ form, setForm, predictions, onGenerate }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(340px,520px)_1fr]">
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
            #{String(predictions.length + 1).padStart(3, '0')}
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
          <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            Confidence Score
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="100"
              value={form.confidence}
              onChange={(event) =>
                setForm((current) => ({ ...current, confidence: Number(event.target.value) }))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-arena-400"
            />
            <span className="min-w-14 text-right font-display text-sm font-bold text-arena-400">
              {form.confidence}%
            </span>
          </div>
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

      <section className="space-y-4">
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

function GroundTruthView({ form, setForm, battles, selectedBattle, onSubmit, accuracy }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(340px,520px)_1fr]">
      <section className="glass-panel rounded-[28px] p-5 shadow-soft md:p-6">
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
          {battles.map((battle) => (
            <option key={battle.id} value={battle.id} className="bg-slate-950">
              Match #{battle.id} - {battle.battlerA} vs {battle.battlerB}
            </option>
          ))}
        </select>

        <div className="mt-5">
          <label className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
            Actual Winner
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            {[selectedBattle?.battlerA ?? 'Battler A', selectedBattle?.battlerB ?? 'Battler B'].map(
              (name) => (
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
              ),
            )}
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

function PredictionCard({ battle }) {
  return (
    <article className="glass-panel rounded-[24px] p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-arena-400/35">
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
              {battle.battlerA} <span className="text-red-400">VS</span> {battle.battlerB}
            </div>
          </div>
        </div>
        <Badge>{battle.model}</Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <NameTile label="Battler A" name={battle.battlerA} highlighted={battle.predictedWinner === battle.battlerA} />
        <div className="text-center font-display text-2xl font-bold text-red-400">VS</div>
        <NameTile label="Battler B" name={battle.battlerB} highlighted={battle.predictedWinner === battle.battlerB} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Confidence</span>
          <span className="text-arena-400">{Math.round(battle.confidence * 100)}%</span>
        </div>
        <div className="h-3 rounded-full bg-white/10">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-arena-300 via-arena-400 to-arena-100 shadow-[0_0_20px_rgba(255,215,0,0.35)]"
            style={{ width: `${battle.confidence * 100}%` }}
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
  const statusCorrect = battle.actualWinner && battle.actualWinner === battle.predictedWinner;

  return (
    <article className="glass-panel rounded-[24px] p-5 shadow-soft transition hover:-translate-y-0.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.32em] text-arena-400">
            Match #{battle.id}
          </div>
          <div className="mt-1 font-display text-xl font-bold text-slate-100">
            {battle.battlerA} vs {battle.battlerB}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{battle.model}</Badge>
          <Badge tone={battle.actualWinner ? (statusCorrect ? 'success' : 'danger') : 'warning'}>
            {battle.actualWinner ? (statusCorrect ? 'Prediction Correct' : 'Prediction Missed') : 'Pending'}
          </Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <InfoBlock label="Predicted Winner" value={battle.predictedWinner} accent />
        <InfoBlock label="Actual Winner" value={battle.actualWinner || 'Pending'} success={Boolean(battle.actualWinner)} />
        <InfoBlock label="MVP" value={battle.mvp || 'Pending'} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Confidence</span>
          <span className="text-arena-400">{Math.round(battle.confidence * 100)}%</span>
        </div>
        <div className="h-3 rounded-full bg-white/10">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-arena-300 via-arena-400 to-arena-100 shadow-[0_0_20px_rgba(255,215,0,0.35)]"
            style={{ width: `${battle.confidence * 100}%` }}
          />
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

      <p className="mt-4 font-mono text-sm leading-6 text-slate-300">{battle.reason}</p>
    </article>
  );
}

function HistoryCard({ battle }) {
  const statusCorrect = battle.actualWinner && battle.actualWinner === battle.predictedWinner;

  return (
    <article className="glass-panel rounded-[24px] p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.32em] text-arena-400">
            #{battle.id}
          </div>
          <div className="mt-1 font-display text-xl font-bold text-slate-100">
            {battle.battlerA} vs {battle.battlerB}
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
            {battle.predictedWinner}
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

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Confidence</span>
          <span className="text-arena-400">{Math.round(battle.confidence * 100)}%</span>
        </div>
        <div className="h-3 rounded-full bg-white/10">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-arena-300 via-arena-400 to-arena-100 shadow-[0_0_20px_rgba(255,215,0,0.35)]"
            style={{ width: `${battle.confidence * 100}%` }}
          />
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
        <img
          src={battle.screenshotPreview}
          alt={`Proof for match ${battle.id}`}
          className="mt-4 max-h-72 w-full rounded-2xl border border-white/10 object-cover"
        />
      ) : null}
    </article>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text', compact = false }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border border-arena-400/25 bg-slate-950/50 px-4 ${
          compact ? 'py-2.5' : 'py-3'
        } font-display text-base text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-arena-400 focus:ring-2 focus:ring-arena-400/20`}
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

export default App;

