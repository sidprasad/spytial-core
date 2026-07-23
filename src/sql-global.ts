/**
 * CDN (IIFE) entry — source of dist/browser/spytial-core-sql.global.js.
 *
 * Opt-in SQL selector support. SQLEvaluator left the main bundle in 4.0.0
 * because it drags the alasql SQL engine (~500 KB min) into every page; this
 * bundle inlines alasql and is loaded only by pages that use SQL selectors:
 *
 *   <script src=".../spytial-core-complete.global.js"></script>
 *   <script src=".../spytial-core-sql.global.js"></script>
 *
 * Loaded after the main bundle it merges SQLEvaluator onto the existing
 * window.spytialcore global (and its legacy aliases), so
 * `new spytialcore.SQLEvaluator()` / `new CndCore.SQLEvaluator()` keep
 * working exactly as before the split.
 */
import { SQLEvaluator, SQLEvaluatorResult } from './evaluators/data/sql-evaluator';

export { SQLEvaluator, SQLEvaluatorResult };

if (typeof window !== 'undefined') {
  const globalWindow = window as any;
  // The three names usually alias one object, but merge into each defensively.
  for (const core of [globalWindow.spytialcore, globalWindow.CndCore, globalWindow.CnDCore]) {
    if (core && typeof core === 'object') {
      core.SQLEvaluator = SQLEvaluator;
      core.SQLEvaluatorResult = SQLEvaluatorResult;
    }
  }
  // Also reachable standalone (page loaded only the SQL bundle).
  globalWindow.spytialSql = { SQLEvaluator, SQLEvaluatorResult };
}
