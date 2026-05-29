#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PokéAPI → Supabase Data Pipeline
// Engine 3 · Section 3ISA
//
// Fetches Pokémon data from PokéAPI for the specified generations,
// maps each to its native region, flags restricted Pokémon
// (Legendary / Mythical / Paradox), and inserts into the Supabase
// `pokemon_data` table.
//
// Also outputs a CSV file matching the required export format.
//
// Usage:
//   node scripts/fetch_pokemon.js
//
// Requires .env file with:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

// ── Load .env manually (avoid extra deps) ─────────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) {
    console.error('❌ .env file not found at', envPath);
    console.error('   Copy .env.example → .env and fill in your Supabase keys.');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = val;
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Generation → Region mapping ──────────────────────────────────────────
const GEN_TO_REGION = {
  1: 'Kanto',
  2: 'Johto',
  3: 'Hoenn',
  4: 'Sinnoh',
  5: 'Unova',
  6: 'Kalos',
  7: 'Alola',
  8: 'Galar',
  9: 'Paldea',
};

// ── Which generations to fetch (3ISA = Hoenn, Sinnoh, Galar) ─────────────
// Fetch the full PokéAPI dataset so the prediction engine can score any matchup.
// The app can still filter by native region when needed.
const GENERATIONS_TO_FETCH = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// ── Helpers ───────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getRestrictedStatus(isLegendary, isMythical) {
  if (isMythical)  return 'mythical';
  if (isLegendary) return 'legendary';
  return 'none';
}

// ── Main pipeline ─────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  PokéAPI → Supabase Data Pipeline                    ║');
  console.log('║  Engine 3 · 3ISA · Hoenn / Sinnoh / Galar            ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log();

  const allPokemon = [];

  for (const gen of GENERATIONS_TO_FETCH) {
    const region = GEN_TO_REGION[gen];
    console.log(`\n📦 Fetching Generation ${gen} (${region})…`);

    // 1. Get list of species in this generation
    const genData   = await fetchJSON(`https://pokeapi.co/api/v2/generation/${gen}/`);
    const speciesList = genData.pokemon_species;
    console.log(`   Found ${speciesList.length} Pokémon species.`);

    // 2. Fetch each species + its default form for stats
    for (let i = 0; i < speciesList.length; i++) {
      const speciesUrl = speciesList[i].url;
      const speciesId  = parseInt(speciesUrl.split('/').filter(Boolean).pop(), 10);

      try {
        // Fetch species data (for is_legendary, is_mythical)
        const speciesData = await fetchJSON(speciesUrl);

        // Fetch pokemon data (for types, stats)
        const pokemonData = await fetchJSON(`https://pokeapi.co/api/v2/pokemon/${speciesId}/`);

        // Extract types
        const types  = pokemonData.types.sort((a, b) => a.slot - b.slot);
        const type_1 = capitalize(types[0]?.type?.name ?? 'Normal');
        const type_2 = types.length > 1 ? capitalize(types[1].type.name) : null;

        // Extract base stats
        const statMap = {};
        for (const s of pokemonData.stats) {
          statMap[s.stat.name] = s.base_stat;
        }

        const isLegendary = speciesData.is_legendary ?? false;
        const isMythical  = speciesData.is_mythical  ?? false;

        const row = {
          pokemon_id:        speciesId,
          pokemon_name:      capitalize(speciesData.name),
          type_1,
          type_2,
          native_region:     region,
          generation:        gen,
          hp:                statMap['hp']              ?? 0,
          attack:            statMap['attack']          ?? 0,
          defense:           statMap['defense']         ?? 0,
          special_attack:    statMap['special-attack']  ?? 0,
          special_defense:   statMap['special-defense'] ?? 0,
          speed:             statMap['speed']           ?? 0,
          is_legendary:      isLegendary,
          is_mythical:       isMythical,
          restricted_status: getRestrictedStatus(isLegendary, isMythical),
          source:            'PokéAPI',
        };

        allPokemon.push(row);

        // Progress every 10 Pokémon
        if ((i + 1) % 10 === 0 || i === speciesList.length - 1) {
          process.stdout.write(`\r   ✓ ${i + 1}/${speciesList.length} fetched`);
        }

        // Rate-limit: 100ms between requests to be polite to PokéAPI
        await sleep(100);

      } catch (err) {
        console.warn(`\n   ⚠ Failed to fetch #${speciesId}: ${err.message}`);
      }
    }
    console.log(); // newline after progress
  }

  // Sort by National Dex number
  allPokemon.sort((a, b) => a.pokemon_id - b.pokemon_id);

  console.log(`\n📊 Total Pokémon fetched: ${allPokemon.length}`);

  // ── Count stats ────────────────────────────────────────────────────────
  const regionCounts = {};
  let legendaryCount = 0, mythicalCount = 0;
  for (const p of allPokemon) {
    regionCounts[p.native_region] = (regionCounts[p.native_region] || 0) + 1;
    if (p.is_legendary) legendaryCount++;
    if (p.is_mythical) mythicalCount++;
  }
  console.log('   Per region:', regionCounts);
  console.log(`   Legendary: ${legendaryCount} | Mythical: ${mythicalCount} | Restricted total: ${legendaryCount + mythicalCount}`);

  // ── Insert into Supabase ───────────────────────────────────────────────
  console.log('\n🔄 Inserting into Supabase pokemon_data table…');

  // Upsert in batches of 50 to avoid payload limits
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < allPokemon.length; i += BATCH) {
    const batch = allPokemon.slice(i, i + BATCH);
    const { error } = await supabase
      .from('pokemon_data')
      .upsert(batch, { onConflict: 'pokemon_id' });

    if (error) {
      console.error(`   ❌ Batch ${i}-${i + batch.length} failed:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r   ✓ ${inserted}/${allPokemon.length} inserted`);
    }
  }
  console.log();

  // ── Export CSV ─────────────────────────────────────────────────────────
  const csvPath = resolve(ROOT, 'pokemon_data.csv');
  const csvHeader = [
    'pokemon_id', 'pokemon_name', 'type_1', 'type_2',
    'native_region', 'generation',
    'hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed',
    'is_legendary', 'is_mythical', 'restricted_status', 'source',
  ].join(',');

  const csvRows = allPokemon.map(p => [
    p.pokemon_id,
    `"${p.pokemon_name}"`,
    `"${p.type_1}"`,
    p.type_2 ? `"${p.type_2}"` : '',
    `"${p.native_region}"`,
    p.generation,
    p.hp, p.attack, p.defense, p.special_attack, p.special_defense, p.speed,
    p.is_legendary, p.is_mythical,
    `"${p.restricted_status}"`,
    `"${p.source}"`,
  ].join(','));

  writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf-8');
  console.log(`\n📄 CSV exported → ${csvPath}`);

  // ── Export SQL (for documentation/reproducibility) ─────────────────────
  const sqlPath = resolve(ROOT, 'supabase_seed_pokemon.sql');
  let sql = '-- Auto-generated by scripts/fetch_pokemon.js\n';
  sql += '-- PokéAPI → pokemon_data seed for 3ISA (Hoenn, Sinnoh, Galar)\n\n';
  sql += 'INSERT INTO public.pokemon_data\n';
  sql += '  (pokemon_id, pokemon_name, type_1, type_2, native_region, generation,\n';
  sql += '   hp, attack, defense, special_attack, special_defense, speed,\n';
  sql += '   is_legendary, is_mythical, restricted_status, source)\n';
  sql += 'VALUES\n';

  const sqlRows = allPokemon.map((p, idx) => {
    const t2   = p.type_2 ? `'${p.type_2}'` : 'null';
    const last = idx === allPokemon.length - 1 ? ';' : ',';
    return `  (${p.pokemon_id}, '${p.pokemon_name.replace(/'/g, "''")}', '${p.type_1}', ${t2}, '${p.native_region}', ${p.generation}, ${p.hp}, ${p.attack}, ${p.defense}, ${p.special_attack}, ${p.special_defense}, ${p.speed}, ${p.is_legendary}, ${p.is_mythical}, '${p.restricted_status}', '${p.source}')${last}`;
  });
  sql += sqlRows.join('\n');
  sql += '\n\n-- ON CONFLICT: if you need to re-run, uncomment below:\n';
  sql += '-- ON CONFLICT (pokemon_id) DO UPDATE SET\n';
  sql += '--   pokemon_name = EXCLUDED.pokemon_name,\n';
  sql += '--   type_1 = EXCLUDED.type_1, type_2 = EXCLUDED.type_2,\n';
  sql += '--   hp = EXCLUDED.hp, attack = EXCLUDED.attack, defense = EXCLUDED.defense,\n';
  sql += '--   special_attack = EXCLUDED.special_attack, special_defense = EXCLUDED.special_defense,\n';
  sql += '--   speed = EXCLUDED.speed;\n';

  writeFileSync(sqlPath, sql, 'utf-8');
  console.log(`📄 SQL seed exported → ${sqlPath}`);

  // ── Done ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Pipeline complete!');
  console.log(`   ${allPokemon.length} Pokémon → Supabase pokemon_data table`);
  console.log(`   CSV → pokemon_data.csv`);
  console.log(`   SQL → supabase_seed_pokemon.sql`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n💥 Pipeline failed:', err);
  process.exit(1);
});
