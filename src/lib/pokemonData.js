import pokemonCsv from '../../pokemon_data.csv?raw';

const fallbackPokemon = [
  {
    pokemon_id: 38,
    pokemon_name: 'Ninetales',
    type_1: 'Fire',
    type_2: null,
    native_region: 'Kanto',
    generation: 1,
    hp: 73,
    attack: 76,
    defense: 75,
    special_attack: 81,
    special_defense: 100,
    speed: 100,
    is_legendary: false,
    is_mythical: false,
    restricted_status: 'none',
    source: 'PokéAPI',
    isFallback: true,
  },
];

const TYPE_CHART = {
  Normal: { resisted: ['Rock', 'Steel'], immune: ['Ghost'] },
  Fire: { superEffective: ['Grass', 'Ice', 'Bug', 'Steel'], resisted: ['Fire', 'Water', 'Rock', 'Dragon'] },
  Water: { superEffective: ['Fire', 'Ground', 'Rock'], resisted: ['Water', 'Grass', 'Dragon'] },
  Electric: { superEffective: ['Water', 'Flying'], resisted: ['Electric', 'Grass', 'Dragon'], immune: ['Ground'] },
  Grass: {
    superEffective: ['Water', 'Ground', 'Rock'],
    resisted: ['Fire', 'Grass', 'Poison', 'Flying', 'Bug', 'Dragon', 'Steel'],
  },
  Ice: { superEffective: ['Grass', 'Ground', 'Flying', 'Dragon'], resisted: ['Fire', 'Water', 'Ice', 'Steel'] },
  Fighting: {
    superEffective: ['Normal', 'Ice', 'Rock', 'Dark', 'Steel'],
    resisted: ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy'],
    immune: ['Ghost'],
  },
  Poison: { superEffective: ['Grass', 'Fairy'], resisted: ['Poison', 'Ground', 'Rock', 'Ghost'], immune: ['Steel'] },
  Ground: { superEffective: ['Fire', 'Electric', 'Poison', 'Rock', 'Steel'], resisted: ['Grass', 'Bug'], immune: ['Flying'] },
  Flying: { superEffective: ['Grass', 'Fighting', 'Bug'], resisted: ['Electric', 'Rock', 'Steel'] },
  Psychic: { superEffective: ['Fighting', 'Poison'], resisted: ['Psychic', 'Steel'], immune: ['Dark'] },
  Bug: {
    superEffective: ['Grass', 'Psychic', 'Dark'],
    resisted: ['Fighting', 'Flying', 'Poison', 'Ghost', 'Steel', 'Fire', 'Fairy'],
  },
  Rock: { superEffective: ['Fire', 'Ice', 'Flying', 'Bug'], resisted: ['Fighting', 'Ground', 'Steel'] },
  Ghost: { superEffective: ['Psychic', 'Ghost'], resisted: ['Dark'], immune: ['Normal'] },
  Dragon: { superEffective: ['Dragon'], resisted: ['Steel'], immune: ['Fairy'] },
  Dark: { superEffective: ['Psychic', 'Ghost'], resisted: ['Fighting', 'Dark', 'Fairy'] },
  Steel: { superEffective: ['Ice', 'Rock', 'Fairy'], resisted: ['Fire', 'Water', 'Electric', 'Steel'] },
  Fairy: { superEffective: ['Fighting', 'Dragon', 'Dark'], resisted: ['Fire', 'Poison', 'Steel'] },
};

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let isInQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (isInQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        isInQuotes = !isInQuotes;
      }
      continue;
    }

    if (character === ',' && !isInQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function toBoolean(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function normalizePokemonName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeProbability(value, fallback = 0.5) {
  const probability = Number(value);
  if (!Number.isFinite(probability)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, probability));
}

function parseCsvDataset(csvText) {
  const lines = String(csvText ?? '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const header = parseCsvLine(lines[0]).map((value) => value.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};

    header.forEach((column, columnIndex) => {
      row[column] = values[columnIndex] ?? '';
    });

    return {
      pokemon_id: toFiniteNumber(row.pokemon_id),
      pokemon_name: row.pokemon_name,
      type_1: row.type_1 || 'Normal',
      type_2: row.type_2 || null,
      native_region: row.native_region || '',
      generation: toFiniteNumber(row.generation),
      hp: toFiniteNumber(row.hp),
      attack: toFiniteNumber(row.attack),
      defense: toFiniteNumber(row.defense),
      special_attack: toFiniteNumber(row.special_attack),
      special_defense: toFiniteNumber(row.special_defense),
      speed: toFiniteNumber(row.speed),
      is_legendary: toBoolean(row.is_legendary),
      is_mythical: toBoolean(row.is_mythical),
      restricted_status: row.restricted_status || 'none',
      source: row.source || 'PokéAPI',
      isFallback: false,
    };
  });
}

const pokemonByName = new Map();
const pokemonByNormalizedName = new Map();

function registerPokemon(record) {
  const normalizedName = normalizePokemonName(record.pokemon_name);
  pokemonByName.set(record.pokemon_name, record);
  pokemonByNormalizedName.set(normalizedName, record);
}

parseCsvDataset(pokemonCsv).forEach(registerPokemon);
fallbackPokemon.forEach((record) => {
  if (!pokemonByNormalizedName.has(normalizePokemonName(record.pokemon_name))) {
    registerPokemon(record);
  }
});

function parseLineup(value) {
  return String(value ?? '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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

function getPokemonRecord(name) {
  const normalizedName = normalizePokemonName(name);
  return pokemonByNormalizedName.get(normalizedName) ?? null;
}

function getPokemonTypes(record) {
  const types = [record.type_1].filter(Boolean);
  if (record.type_2) {
    types.push(record.type_2);
  }
  return types;
}

function typeMultiplier(attackType, defenderType) {
  const chart = TYPE_CHART[attackType];
  if (!chart) {
    return 1;
  }

  if (chart.immune?.includes(defenderType)) {
    return 0;
  }

  if (chart.superEffective?.includes(defenderType)) {
    return 2;
  }

  if (chart.resisted?.includes(defenderType)) {
    return 0.5;
  }

  return 1;
}

function typeEffectiveness(attackType, defenderTypes) {
  return defenderTypes.reduce((multiplier, defenderType) => multiplier * typeMultiplier(attackType, defenderType), 1);
}

function bestOffenseMultiplier(attackerTypes, defenderTypes) {
  if (!attackerTypes.length || !defenderTypes.length) {
    return 1;
  }

  return Math.max(
    ...attackerTypes.map((attackType) => typeEffectiveness(attackType, defenderTypes)),
  );
}

function average(numbers) {
  if (!numbers.length) {
    return 0;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function buildResolvedTeam(lineup) {
  return lineup.map((name) => {
    const record = getPokemonRecord(name);
    if (record) {
      return {
        ...record,
        displayName: record.pokemon_name,
        isMissing: false,
      };
    }

    return {
      pokemon_id: 0,
      pokemon_name: name,
      displayName: name,
      type_1: 'Normal',
      type_2: null,
      native_region: '',
      generation: 0,
      hp: 70,
      attack: 70,
      defense: 70,
      special_attack: 70,
      special_defense: 70,
      speed: 70,
      is_legendary: false,
      is_mythical: false,
      restricted_status: 'unknown',
      source: 'fallback',
      isFallback: true,
      isMissing: true,
    };
  });
}

function calculateTeamScore(team, opponent, expectedRegion, filters = {}) {
  const totals = team.reduce(
    (accumulator, pokemon) => {
      accumulator.hp += pokemon.hp;
      accumulator.attack += pokemon.attack;
      accumulator.defense += pokemon.defense;
      accumulator.specialAttack += pokemon.special_attack;
      accumulator.specialDefense += pokemon.special_defense;
      accumulator.speed += pokemon.speed;
      return accumulator;
    },
    {
      hp: 0,
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    },
  );
  const totalBaseStats = team.reduce(
    (sum, pokemon) =>
      sum +
      toFiniteNumber(pokemon.hp) +
      toFiniteNumber(pokemon.attack) +
      toFiniteNumber(pokemon.defense) +
      toFiniteNumber(pokemon.special_attack) +
      toFiniteNumber(pokemon.special_defense) +
      toFiniteNumber(pokemon.speed),
    0,
  );
  const averageSpeed = average(team.map((pokemon) => toFiniteNumber(pokemon.speed)));
  const matchupCoverage = average(
    team.map((pokemon) =>
      average(
        opponent.map((foe) => bestOffenseMultiplier(getPokemonTypes(pokemon), getPokemonTypes(foe))),
      ),
    ),
  );
  const nativeMatches = expectedRegion
    ? team.filter((pokemon) => String(pokemon.native_region).toLowerCase() === String(expectedRegion).toLowerCase()).length
    : 0;
  const restrictedCount = team.filter(
    (pokemon) => pokemon.restricted_status !== 'none' || pokemon.is_legendary || pokemon.is_mythical,
  ).length;
  const missingCount = team.filter((pokemon) => pokemon.isMissing).length;

  const score =
    (totalBaseStats / 100) +
    (averageSpeed / 50) +
    (matchupCoverage * 8) +
    (nativeMatches * 0.75) -
    (restrictedCount * 4) -
    (missingCount * 2) +
    (filters.restrictionFilter === false ? restrictedCount * 0.5 : 0);

  const notes = [];
  if (expectedRegion && nativeMatches === team.length) {
    notes.push(`All ${team.length} Pokémon are native to ${expectedRegion}.`);
  } else if (expectedRegion) {
    notes.push(`${nativeMatches}/${team.length} Pokémon are native to ${expectedRegion}.`);
  }
  if (restrictedCount) {
    notes.push(`${restrictedCount} restricted Pokémon found.`);
  }
  if (missingCount) {
    notes.push(`${missingCount} Pokémon are using fallback data.`);
  }

  return {
    score: toFiniteNumber(score, 0),
    teamSize: team.length,
    totalBaseStats: toFiniteNumber(totalBaseStats, 0),
    averageHp: team.length ? toFiniteNumber(totals.hp / team.length, 0) : 0,
    averageAttack: team.length ? toFiniteNumber(totals.attack / team.length, 0) : 0,
    averageDefense: team.length ? toFiniteNumber(totals.defense / team.length, 0) : 0,
    averageSpecialAttack: team.length ? toFiniteNumber(totals.specialAttack / team.length, 0) : 0,
    averageSpecialDefense: team.length ? toFiniteNumber(totals.specialDefense / team.length, 0) : 0,
    averageSpeed: toFiniteNumber(averageSpeed, 0),
    physicalPower: team.length ? toFiniteNumber((totals.attack + totals.defense) / team.length, 0) : 0,
    specialPower: team.length ? toFiniteNumber((totals.specialAttack + totals.specialDefense) / team.length, 0) : 0,
    matchupCoverage: toFiniteNumber(matchupCoverage, 0),
    nativeMatches,
    nativeRatio: team.length ? toFiniteNumber(nativeMatches / team.length, 0) : 0,
    restrictedCount,
    missingCount,
    validation: {
      valid: restrictedCount === 0 && missingCount === 0 && (!expectedRegion || nativeMatches === team.length),
      notes,
    },
  };
}

function buildReason(winnerSide, gymSummary, challengerSummary, gymRegion, challengerRegion) {
  const winnerSummary = winnerSide === 'gymLeader' ? gymSummary : challengerSummary;
  const loserSummary = winnerSide === 'gymLeader' ? challengerSummary : gymSummary;
  const winnerLabel = winnerSide === 'gymLeader' ? gymRegion || 'Gym Leader' : challengerRegion || 'Challenger';
  const loserLabel = winnerSide === 'gymLeader' ? challengerRegion || 'Challenger' : gymRegion || 'Gym Leader';
  const notes = [];

  if (winnerSummary.matchupCoverage > loserSummary.matchupCoverage) {
    notes.push('better type matchup coverage');
  }
  if (winnerSummary.totalBaseStats > loserSummary.totalBaseStats) {
    notes.push('stronger total base stats');
  }
  if (winnerSummary.averageSpeed > loserSummary.averageSpeed) {
    notes.push('higher average speed');
  }
  if (winnerSummary.nativeMatches > loserSummary.nativeMatches) {
    notes.push('better native-region compliance');
  }

  const comparisonText = notes.length ? notes.slice(0, 2).join(' and ') : 'a slightly better overall matchup score';
  return `${winnerLabel} is favored over ${loserLabel} because of ${comparisonText}.`;
}

const FEATURE_KEYS = [
  'totalStatDiff',
  'hpDiff',
  'attackDiff',
  'defenseDiff',
  'specialAttackDiff',
  'specialDefenseDiff',
  'speedDiff',
  'bulkDiff',
  'coverageDiff',
  'nativeRatioDiff',
  'restrictedDiff',
  'missingDiff',
  'teamSizeDiff',
];

function summarizeBattleSides(form) {
  const gymLeaderRegion = parseRegionAndType(form.gymLeaderRegion).region;
  const challengerRegion = String(form.challengerRegion ?? '').trim();
  const gymLeaderLineup = buildResolvedTeam(parseLineup(form.gymLeaderLineup));
  const challengerLineup = buildResolvedTeam(parseLineup(form.challengerLineup));
  const gymLeaderSummary = calculateTeamScore(gymLeaderLineup, challengerLineup, gymLeaderRegion, form);
  const challengerSummary = calculateTeamScore(challengerLineup, gymLeaderLineup, challengerRegion, form);

  return {
    gymLeaderRegion,
    challengerRegion,
    gymLeaderLineup,
    challengerLineup,
    gymLeaderSummary,
    challengerSummary,
  };
}

function buildFeatureVector(gymSummary, challengerSummary) {
  const gymBulk = gymSummary.averageHp + gymSummary.averageDefense + gymSummary.averageSpecialDefense;
  const challengerBulk =
    challengerSummary.averageHp + challengerSummary.averageDefense + challengerSummary.averageSpecialDefense;

  return {
    totalStatDiff: toFiniteNumber(gymSummary.totalBaseStats - challengerSummary.totalBaseStats, 0),
    hpDiff: toFiniteNumber(gymSummary.averageHp - challengerSummary.averageHp, 0),
    attackDiff: toFiniteNumber(gymSummary.averageAttack - challengerSummary.averageAttack, 0),
    defenseDiff: toFiniteNumber(gymSummary.averageDefense - challengerSummary.averageDefense, 0),
    specialAttackDiff: toFiniteNumber(gymSummary.averageSpecialAttack - challengerSummary.averageSpecialAttack, 0),
    specialDefenseDiff: toFiniteNumber(gymSummary.averageSpecialDefense - challengerSummary.averageSpecialDefense, 0),
    speedDiff: toFiniteNumber(gymSummary.averageSpeed - challengerSummary.averageSpeed, 0),
    bulkDiff: toFiniteNumber(gymBulk - challengerBulk, 0),
    coverageDiff: toFiniteNumber(gymSummary.matchupCoverage - challengerSummary.matchupCoverage, 0),
    nativeRatioDiff: toFiniteNumber(gymSummary.nativeRatio - challengerSummary.nativeRatio, 0),
    restrictedDiff: toFiniteNumber(challengerSummary.restrictedCount - gymSummary.restrictedCount, 0),
    missingDiff: toFiniteNumber(challengerSummary.missingCount - gymSummary.missingCount, 0),
    teamSizeDiff: toFiniteNumber(gymSummary.teamSize - challengerSummary.teamSize, 0),
  };
}

function vectorFromFeatureObject(featureObject) {
  return FEATURE_KEYS.map((key) => toFiniteNumber(featureObject[key], 0));
}

function labelFromBattleRecord(record) {
  const actualWinner = String(record.actualWinner ?? record.actual_winner ?? '').trim();
  const battlerA = String(record.battlerA ?? record.battler_a ?? '').trim();
  const battlerB = String(record.battlerB ?? record.battler_b ?? '').trim();

  if (!actualWinner || !battlerA || !battlerB) {
    return null;
  }

  if (normalizePokemonName(actualWinner) === normalizePokemonName(battlerA)) {
    return 1;
  }

  if (normalizePokemonName(actualWinner) === normalizePokemonName(battlerB)) {
    return 0;
  }

  return null;
}

function buildTrainingExamples(history = []) {
  const examples = [];

  history.forEach((battle) => {
    const label = labelFromBattleRecord(battle);
    if (label === null) {
      return;
    }

    const gymLeaderLineup = Array.isArray(battle.gymLeaderLineup)
      ? battle.gymLeaderLineup
      : parseLineup(battle.gymLeaderLineup ?? battle.gym_leader_lineup ?? '');
    const challengerLineup = Array.isArray(battle.challengerLineup)
      ? battle.challengerLineup
      : parseLineup(battle.challengerLineup ?? battle.challenger_lineup ?? '');
    const gymLeaderRegion = parseRegionAndType(battle.gymLeaderRegion ?? battle.gym_leader_region ?? '').region;
    const challengerRegion = String(battle.challengerRegion ?? battle.challenger_region ?? '').trim();
    const gymSummary = calculateTeamScore(
      buildResolvedTeam(gymLeaderLineup),
      buildResolvedTeam(challengerLineup),
      gymLeaderRegion,
    );
    const challengerSummary = calculateTeamScore(
      buildResolvedTeam(challengerLineup),
      buildResolvedTeam(gymLeaderLineup),
      challengerRegion,
    );

    examples.push({
      features: buildFeatureVector(gymSummary, challengerSummary),
      label,
    });
  });

  return examples;
}

function mean(numbers) {
  if (!numbers.length) {
    return 0;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function variance(numbers, averageValue) {
  if (!numbers.length) {
    return 1;
  }

  const avg = averageValue ?? mean(numbers);
  const value = numbers.reduce((sum, number) => sum + ((number - avg) ** 2), 0) / numbers.length;
  return Math.max(value, 1e-6);
}

function standardizeExamples(examples) {
  const means = FEATURE_KEYS.map((_, index) => mean(examples.map((example) => example.features[index])));
  const stds = FEATURE_KEYS.map((_, index) => Math.sqrt(variance(examples.map((example) => example.features[index]), means[index])));

  return {
    means,
    stds: stds.map((value) => Math.max(value, 1e-6)),
  };
}

function standardizeVector(vector, means, stds) {
  return vector.map((value, index) => (value - means[index]) / stds[index]);
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, value))));
}

function trainLogisticRegression(examples) {
  const { means, stds } = standardizeExamples(examples);
  const weights = new Array(FEATURE_KEYS.length).fill(0);
  let bias = 0;
  const learningRate = 0.08;
  const iterations = 350;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradients = new Array(FEATURE_KEYS.length).fill(0);
    let biasGradient = 0;

    examples.forEach((example) => {
      const vector = standardizeVector(example.features, means, stds);
      const prediction = sigmoid(weights.reduce((sum, weight, index) => sum + (weight * vector[index]), bias));
      const error = prediction - example.label;

      vector.forEach((value, index) => {
        gradients[index] += error * value;
      });
      biasGradient += error;
    });

    weights.forEach((_, index) => {
      weights[index] -= learningRate * (gradients[index] / examples.length);
    });
    bias -= learningRate * (biasGradient / examples.length);
  }

  return { type: 'logistic', weights, bias, means, stds };
}

function predictLogisticRegression(model, features) {
  const vector = standardizeVector(features.map((value) => toFiniteNumber(value, 0)), model.means, model.stds);
  const logit = model.weights.reduce((sum, weight, index) => sum + (weight * vector[index]), model.bias);
  return sanitizeProbability(sigmoid(logit));
}

function trainNaiveBayes(examples) {
  const grouped = {
    0: examples.filter((example) => example.label === 0),
    1: examples.filter((example) => example.label === 1),
  };

  const stats = { 0: {}, 1: {} };

  [0, 1].forEach((label) => {
    FEATURE_KEYS.forEach((key, index) => {
      const values = grouped[label].map((example) => example.features[index]);
      const avg = mean(values);
      stats[label][key] = {
        mean: avg,
        variance: variance(values, avg),
      };
    });
  });

  return {
    type: 'naive-bayes',
    priors: {
      0: grouped[0].length / examples.length,
      1: grouped[1].length / examples.length,
    },
    stats,
  };
}

function gaussianLogProbability(value, meanValue, varianceValue) {
  const varianceSafe = Math.max(varianceValue, 1e-6);
  return -0.5 * Math.log(2 * Math.PI * varianceSafe) - (((value - meanValue) ** 2) / (2 * varianceSafe));
}

function predictNaiveBayes(model, features) {
  const safeFeatures = features.map((value) => toFiniteNumber(value, 0));
  const scores = [0, 1].map((label) => {
    let score = Math.log(Math.max(model.priors[label], 1e-6));
    FEATURE_KEYS.forEach((key, index) => {
      const statistic = model.stats[label][key];
      score += gaussianLogProbability(safeFeatures[index], statistic.mean, statistic.variance);
    });
    return score;
  });

  const maxScore = Math.max(...scores);
  const expScores = scores.map((score) => Math.exp(score - maxScore));
  return sanitizeProbability(expScores[1] / (expScores[0] + expScores[1]));
}

function giniImpurity(examples) {
  if (!examples.length) {
    return 0;
  }

  const positives = examples.filter((example) => example.label === 1).length;
  const negatives = examples.length - positives;
  const positiveRate = positives / examples.length;
  const negativeRate = negatives / examples.length;
  return 1 - (positiveRate ** 2) - (negativeRate ** 2);
}

function splitExamples(examples, featureIndex, threshold) {
  const left = [];
  const right = [];

  examples.forEach((example) => {
    if (example.features[featureIndex] <= threshold) {
      left.push(example);
    } else {
      right.push(example);
    }
  });

  return { left, right };
}

function candidateThresholds(values) {
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  const thresholds = [];

  for (let index = 0; index < uniqueValues.length - 1; index += 1) {
    thresholds.push((uniqueValues[index] + uniqueValues[index + 1]) / 2);
  }

  return thresholds;
}

function buildDecisionTree(examples, depth = 3, featurePool = FEATURE_KEYS.map((_, index) => index)) {
  const positiveRate = examples.filter((example) => example.label === 1).length / Math.max(examples.length, 1);

  if (!examples.length || depth <= 0 || positiveRate === 0 || positiveRate === 1 || examples.length < 4) {
    return {
      type: 'leaf',
      probability: Number.isFinite(positiveRate) ? positiveRate : 0.5,
      count: examples.length,
    };
  }

  let bestFeatureIndex = null;
  let bestThreshold = null;
  let bestGain = 0;
  let bestSplit = null;
  const currentImpurity = giniImpurity(examples);

  featurePool.forEach((featureIndex) => {
    const thresholds = candidateThresholds(examples.map((example) => example.features[featureIndex]));
    thresholds.forEach((threshold) => {
      const split = splitExamples(examples, featureIndex, threshold);
      if (!split.left.length || !split.right.length) {
        return;
      }

      const weightedImpurity =
        (split.left.length / examples.length) * giniImpurity(split.left) +
        (split.right.length / examples.length) * giniImpurity(split.right);
      const gain = currentImpurity - weightedImpurity;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeatureIndex = featureIndex;
        bestThreshold = threshold;
        bestSplit = split;
      }
    });
  });

  if (bestFeatureIndex === null || !bestSplit) {
    return {
      type: 'leaf',
      probability: positiveRate,
      count: examples.length,
    };
  }

  const shuffledFeaturePool = [...featurePool].sort(() => Math.random() - 0.5);
  const nextFeaturePool = featurePool.length > 2
    ? shuffledFeaturePool.slice(0, Math.max(2, Math.floor(Math.sqrt(featurePool.length)))).sort((a, b) => a - b)
    : [...featurePool];

  return {
    type: 'node',
    featureIndex: bestFeatureIndex,
    threshold: bestThreshold,
    left: buildDecisionTree(bestSplit.left, depth - 1, nextFeaturePool),
    right: buildDecisionTree(bestSplit.right, depth - 1, nextFeaturePool),
  };
}

function predictDecisionTree(node, features) {
  if (!node) {
    return 0.5;
  }

  if (node.type === 'leaf') {
    return Number.isFinite(node.probability) ? node.probability : 0.5;
  }

  const nextNode = features[node.featureIndex] <= node.threshold ? node.left : node.right;
  return predictDecisionTree(nextNode, features);
}

function trainRandomForest(examples) {
  const trees = [];
  const treeCount = Math.min(11, Math.max(5, examples.length));

  for (let index = 0; index < treeCount; index += 1) {
    const sample = [];
    for (let sampleIndex = 0; sampleIndex < examples.length; sampleIndex += 1) {
      sample.push(examples[Math.floor(Math.random() * examples.length)]);
    }
    trees.push(buildDecisionTree(sample, 4));
  }

  return { type: 'random-forest', trees };
}

function predictRandomForest(model, features) {
  if (!model.trees.length) {
    return 0.5;
  }

  return sanitizeProbability(model.trees.reduce((sum, tree) => sum + predictDecisionTree(tree, features), 0) / model.trees.length);
}

function trainKnn(examples) {
  return { type: 'knn', examples };
}

function predictKnn(model, features) {
  if (!model.examples.length) {
    return 0.5;
  }

  const distances = model.examples
    .map((example) => {
      const distance = Math.sqrt(
        example.features.reduce((sum, value, index) => sum + ((value - features[index]) ** 2), 0),
      );
      return { distance, label: example.label };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(5, model.examples.length));

  let weightedLabel = 0;
  let totalWeight = 0;
  distances.forEach(({ distance, label }) => {
    const weight = 1 / (distance + 1e-6);
    weightedLabel += weight * label;
    totalWeight += weight;
  });

  return sanitizeProbability(totalWeight ? weightedLabel / totalWeight : 0.5);
}

function trainRuleBasedClassifier(examples) {
  return { type: 'rule-based', examples };
}

function predictRuleBased(features) {
  const score =
    (features.totalStatDiff / 250) +
    (features.speedDiff / 80) +
    (features.coverageDiff * 3) +
    (features.nativeRatioDiff * 1.5) +
    (features.bulkDiff / 300) -
    (features.restrictedDiff * 0.8) -
    (features.missingDiff * 0.5);

  return sanitizeProbability(sigmoid(score));
}

function trainModel(modelName, examples) {
  if (!examples.length || new Set(examples.map((example) => example.label)).size < 2) {
    return { type: 'empty', examples: [] };
  }

  switch (modelName) {
    case 'Decision Tree':
      return buildDecisionTree(examples, 4);
    case 'Random Forest':
      return trainRandomForest(examples);
    case 'K-NN':
      return trainKnn(examples);
    case 'Naive Bayes':
      return trainNaiveBayes(examples);
    case 'Logistic Regression':
      return trainLogisticRegression(examples);
    case 'Rule-Based Classifier':
    default:
      return trainRuleBasedClassifier(examples);
  }
}

function predictModel(modelName, model, features, fallbackProbability) {
  if (!model || model.type === 'empty') {
    return fallbackProbability;
  }

  switch (modelName) {
    case 'Decision Tree':
      return predictDecisionTree(model, features);
    case 'Random Forest':
      return predictRandomForest(model, features);
    case 'K-NN':
      return predictKnn(model, features);
    case 'Naive Bayes':
      return predictNaiveBayes(model, features);
    case 'Logistic Regression':
      return predictLogisticRegression(model, features);
    case 'Rule-Based Classifier':
    default:
      return sanitizeProbability(predictRuleBased(features));
  }
}

function buildModelReason({
  modelName,
  probability,
  features,
  gymLeaderSummary,
  challengerSummary,
  trainingCount,
  fallbackUsed,
  gymLeaderName,
  challengerName,
}) {
  const safeProbability = sanitizeProbability(probability, 0.5);
  const winnerSide = safeProbability >= 0.5 ? 'Gym Leader' : 'Challenger';
  const loserSide = safeProbability >= 0.5 ? 'Challenger' : 'Gym Leader';
  const notes = [];

  if (features.coverageDiff > 0) {
    notes.push('better matchup coverage');
  }
  if (features.speedDiff > 0) {
    notes.push('higher average speed');
  }
  if (features.totalStatDiff > 0) {
    notes.push('stronger total base stats');
  }
  if (features.nativeRatioDiff > 0) {
    notes.push('better native-region compliance');
  }
  if (features.restrictedDiff < 0 || features.missingDiff < 0) {
    notes.push('cleaner roster validation');
  }

  const reasonBits = notes.length ? notes.slice(0, 3).join(', ') : 'balanced matchup signals';
  const trainingText = fallbackUsed
    ? 'cold-start rule-based inference'
    : `${trainingCount} resolved battles used for training`;

  return `${modelName} predicts ${winnerSide} over ${loserSide} with ${Math.round(Math.max(safeProbability, 1 - safeProbability) * 100)}% confidence because of ${reasonBits}. ${trainingText}.`;
}

export function buildBattlePrediction(form = {}, history = []) {
  try {
    const gymLeaderName = String(form.gymLeaderName ?? 'Gym Leader').trim() || 'Gym Leader';
    const challengerName = String(form.challengerName ?? 'Challenger').trim() || 'Challenger';
    const modelName = form.model || 'Random Forest';
    const battleContext = summarizeBattleSides(form);
    const { gymLeaderSummary, challengerSummary } = battleContext;
    const currentFeatures = buildFeatureVector(gymLeaderSummary, challengerSummary);
    const trainingExamples = buildTrainingExamples(history);
    const trainingModel = trainModel(modelName, trainingExamples);
    const fallbackProbability = predictRuleBased(currentFeatures);
    const probability = trainingExamples.length
      ? predictModel(modelName, trainingModel, currentFeatures, fallbackProbability)
      : fallbackProbability;
    const safeProbability = sanitizeProbability(probability, fallbackProbability);
    const winnerSide = safeProbability >= 0.5 ? 'gymLeader' : 'challenger';
    const winnerName = winnerSide === 'challenger' ? challengerName : gymLeaderName;
    const confidence = Math.max(50, Math.min(99, Math.round(Math.max(safeProbability, 1 - safeProbability) * 100)));
    const reason = buildModelReason({
      modelName,
      probability: safeProbability,
      features: currentFeatures,
      gymLeaderSummary,
      challengerSummary,
      trainingCount: trainingExamples.length,
      fallbackUsed: !trainingExamples.length,
      gymLeaderName,
      challengerName,
    });
    const validationNotes = [
      ...gymLeaderSummary.validation.notes,
      ...challengerSummary.validation.notes,
      ...(trainingExamples.length ? [] : ['No resolved battles yet, using rule-based cold start until training data exists.']),
    ].filter(Boolean);

    return {
      predictedWinnerSide: winnerSide,
      predictedWinnerName: winnerName,
      confidence,
      reason,
      model: modelName,
      validationCheck: Boolean(gymLeaderSummary.validation.valid && challengerSummary.validation.valid),
      validationNotes,
      gymLeaderSummary,
      challengerSummary,
      trainingCount: trainingExamples.length,
      probability: safeProbability,
    };
  } catch (error) {
    const gymLeaderName = String(form.gymLeaderName ?? 'Gym Leader').trim() || 'Gym Leader';
    const challengerName = String(form.challengerName ?? 'Challenger').trim() || 'Challenger';
    return {
      predictedWinnerSide: 'gymLeader',
      predictedWinnerName: gymLeaderName,
      confidence: 50,
      reason: `Fallback prediction used because the ML engine could not score this matchup safely. ${String(error?.message ?? 'Unknown error')}`,
      model: form.model || 'Random Forest',
      validationCheck: false,
      validationNotes: ['Engine fallback triggered. Check lineup formatting and dataset availability.'],
      gymLeaderSummary: null,
      challengerSummary: null,
      trainingCount: 0,
      probability: 0.5,
      gymLeaderName,
      challengerName,
    };
  }
}

export function safeBuildBattlePrediction(form = {}, history = []) {
  return buildBattlePrediction(form, history);
}

export function parseBattleLineup(value) {
  return parseLineup(value);
}

export function getPokemonDatasetSource() {
  return 'PokéAPI cached CSV';
}
