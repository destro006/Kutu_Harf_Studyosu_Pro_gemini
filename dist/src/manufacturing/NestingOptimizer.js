import { runTrueShapeNesting, validateSheetLayout } from './NestingEngine.js';
import { nfpCandidates } from './NfpGeometry.js';
import { runProNesting } from './NestingEnginePro.js';

// Compact mode optimizes occupied envelope before reusable strip; vertical
// mode instead prefers keeping one continuous full-width reusable offcut.
export function nestingScore(result, strategy = 'compact') {
  let strips = 0, envelope = 0;
  for (const s of result.sheets) {
    const x = Math.max(0, ...s.placements.map(p => p.bounds.maxX));
    const y = Math.max(0, ...s.placements.map(p => p.bounds.maxY));
    strips += strategy === 'vertical' ? x * s.heightMm : Math.min(x * s.heightMm, y * s.widthMm);
    envelope += x * y;
  }
  return [result.unplaced.length, result.sheets.length, ...(strategy === 'compact' ? [envelope, strips] : [strips, envelope])];
}

export function betterNesting(a, b, strategy = 'compact') {
  if (!b) return true;
  const x = nestingScore(a, strategy), y = nestingScore(b, strategy);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 1e-4) return x[i] < y[i];
  return false;
}

export function optimizeNesting(items, config = {}, locked = [], onProgress = () => {}) {
  const start = performance.now();
  const budget = Math.max(500, Math.min(120000, Number(config.optimizationBudgetMs) || 3500));
  const end = start + budget;
  const rawStrategy = config.placementStrategy || 'auto';
  const effectiveStrategy = rawStrategy === 'auto'
    ? ((config.sheetWidthMm || 3000) >= (config.sheetHeightMm || 1500) ? 'compact' : 'bottomLeft')
    : rawStrategy;

  let best = null, attempts = 0, nfpAttempts = 0, proAttempts = 0, proCompleted = 0, selectedEngine = 'baseline';
  const sep = Math.max(0.5, (config.clearanceMm ?? 5) + (config.kerfMm ?? 0.4));

  const accept = (result, engine) => {
    if (
      result.sheets.every(s => validateSheetLayout(s, sep, config.allowHoleNesting !== false).valid) &&
      betterNesting(result, best, effectiveStrategy)
    ) {
      best = result;
      selectedEngine = engine;
    }
  };

  const run = (options) => {
    const out = runTrueShapeNesting(items, { ...config, ...options }, locked);
    attempts++;
    if (options.nfpSearch) nfpAttempts++;
    accept(out, options.nfpSearch ? 'clipper-nfp' : 'baseline');
    onProgress({ attempts, score: best ? nestingScore(best, effectiveStrategy) : null, elapsedMs: Math.round(performance.now() - start), budgetMs: budget });
  };

  run({ itemOrder: 'area', quickImport: true, deadline: Infinity });

  // Exact Minkowski NFP + Multi-Directional Compaction Pro Solver (primary candidate).
  if (performance.now() < end) {
    const remaining = end - performance.now();
    const proBudget = Math.max(80, Math.min(remaining * 0.65, Math.max(300, budget * 0.65)));
    proAttempts++;
    attempts++;
    nfpAttempts++;
    try {
      const out = runProNesting(items, {
        ...config,
        placementStrategy: effectiveStrategy,
        nfpSearch: nfpCandidates,
        timeBudgetMs: proBudget,
        deadline: Math.min(end, performance.now() + proBudget),
      }, locked);
      proCompleted++;
      accept(out, 'v3-pro');
    } catch (error) {
      if (!['PRO_BUDGET', 'PRO_INVALID_LAYOUT'].includes(error?.message)) console.warn('Nesting v3 Pro:', error);
    }
    onProgress({ attempts, score: best ? nestingScore(best, effectiveStrategy) : null, elapsedMs: Math.round(performance.now() - start), budgetMs: budget });
  }

  // Remaining budget: Clipper NFP multi-strategy & deterministic permutation refinement.
  const trials = rawStrategy === 'auto'
    ? [['area', 'compact'], ['area', 'vertical'], ['box', 'compact'], ['long', 'vertical'], ['short', 'compact']]
    : [['area', effectiveStrategy], ['box', 'compact'], ['long', 'vertical'], ['short', 'compact'], ['area', 'bottomLeft']];

  for (const [itemOrder, placementStrategy] of trials) {
    if (performance.now() >= end) break;
    const slice = Math.max(150, (end - performance.now()) / 2);
    run({ itemOrder, placementStrategy, quickImport: false, nfpSearch: nfpCandidates, deadline: Math.min(end, performance.now() + slice) });
  }

  let seed = 0x51f15e, round = 0;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  while (performance.now() < end && round++ < 24 && items.length > 1) {
    const ids = (best?.sheets.flatMap(s => s.placements.map(p => p.id)) || []).concat(items.map(i => i.id));
    const order = [...new Set(ids)];
    for (let k = 0; k < Math.max(1, Math.ceil(order.length * 0.15)); k++) {
      const i = Math.floor(rand() * order.length), j = Math.floor(rand() * order.length);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const anglePreferences = new Map();
    for (const p of best?.sheets.flatMap(s => s.placements) || []) anglePreferences.set(p.id, p.angleDeg);
    run({
      quickImport: false,
      nfpSearch: nfpCandidates,
      orderIds: new Map(order.map((id, i) => [id, i])),
      anglePreferences,
      placementStrategy: effectiveStrategy,
      deadline: Math.min(end, performance.now() + Math.max(150, budget / 5)),
    });
  }

  if (!best) throw Error('Geçerli yerleşim bulunamadı. Kilitli parçaları ve levha ölçülerini kontrol edin.');
  return {
    ...best,
    optimization: {
      attempts,
      nfpAttempts,
      elapsedMs: Math.round(performance.now() - start),
      engineVersion: '3.0-pro',
      method: 'Exact Minkowski NFP v3 Pro + validated Clipper NFP',
      proAttempts,
      proCompleted,
      selectedEngine,
      score: nestingScore(best, effectiveStrategy),
    },
  };
}
