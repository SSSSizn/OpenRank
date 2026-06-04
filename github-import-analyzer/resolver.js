// ========================================================================
// Evidence-Ranked Version Resolver (6 Levels)
// ------------------------------------------------------------------------
// L1  Exact Manifest      （仓库自己的 requirements/pyproject）
// L2  RAG (Co-occurrence)  （历史相似项目的投票）
// L3  Local KB             （单包版本分布统计）
// L4  PyPI Meta            （依赖图约束推断，保留接口）
// L5  Live Latest          （libraries.io / PyPI 最新）
// L6  UNKNOWN              （留给 LLM，但明确标注 unverified）
// ========================================================================

import { EVIDENCE_LEVELS, fetchWithTimeout, pMap } from "./utils.js";
import { ragLookup, statsLookup } from "./rag.js";

const LIBRARIES_API_KEY = "437eac74c0839297e980e94e21809dfb";

async function fetchFromLibraries(pkg) {
  try {
    const url = `https://libraries.io/api/pypi/${pkg}?api_key=${LIBRARIES_API_KEY}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchFromPyPI(pkg) {
  try {
    const url = `https://pypi.org/pypi/${pkg}/json`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// 从已有 manifest 约束中抽精确版本（== x.y.z）
function extractExactFromConstraint(constraint) {
  if (!constraint) return null;
  const m = constraint.match(/==\s*([\d\.\w]+)/);
  return m ? m[1] : null;
}

// ========================================================================
// 核心：按六级证据依次尝试
// ========================================================================
export async function resolveOne(pkg, ctx = {}) {
  const {
    manifestBaseline = {},
    knownVersions = {},
    ragResults = null,
    allowLive = true,
  } = ctx;

  const name = pkg.toLowerCase();

  // ---------- L1 Exact Manifest ----------
  if (manifestBaseline[name]) {
    const exact = extractExactFromConstraint(manifestBaseline[name]);
    if (exact) {
      return {
        package: pkg,
        version: exact,
        source: EVIDENCE_LEVELS.EXACT_MANIFEST.label,
        level: 1,
        confidence: EVIDENCE_LEVELS.EXACT_MANIFEST.baseConfidence,
        evidence: { constraint: manifestBaseline[name], origin: "project-manifest" },
      };
    }
    // 有约束但非精确（>= 等）→ 作为下游的过滤器，继续往下找
    ctx.__constraintHint = manifestBaseline[name];
  }

  // ---------- L2 RAG ----------
  if (ragResults && ragResults[pkg]) {
    const r = ragResults[pkg];
    return {
      package: pkg,
      version: r.version,
      source: EVIDENCE_LEVELS.RAG.label,
      level: 2,
      confidence: r.confidence,
      evidence: {
        support: r.support,
        voteRatio: r.voteRatio,
        topEvidences: r.topEvidences,
        alternatives: r.alternatives,
      },
    };
  }

  // ---------- L3 Local KB (单包统计) ----------
  const stats = await statsLookup(pkg);
  if (stats) {
    return {
      package: pkg,
      version: stats.version,
      source: EVIDENCE_LEVELS.LOCAL_KB.label,
      level: 3,
      confidence: stats.confidence,
      evidence: { distribution: stats.distribution, support: stats.support },
    };
  }

  // ---------- L4 PyPI Meta (留接口) ----------
  // 这一级在有已知上游依赖时可以求解兼容版本，此处先用 latest 作为简化
  // TODO: 接入 requires_dist SAT solver

  // ---------- L5 Live Latest ----------
  if (allowLive) {
    const lib = await fetchFromLibraries(pkg);
    if (lib?.latest_release_number) {
      return {
        package: pkg,
        version: lib.latest_release_number,
        source: EVIDENCE_LEVELS.LIVE_LATEST.label,
        level: 5,
        confidence: EVIDENCE_LEVELS.LIVE_LATEST.baseConfidence,
        evidence: { origin: "libraries.io" },
      };
    }
    const pypi = await fetchFromPyPI(pkg);
    if (pypi?.info?.version) {
      return {
        package: pkg,
        version: pypi.info.version,
        source: EVIDENCE_LEVELS.LIVE_LATEST.label,
        level: 5,
        confidence: EVIDENCE_LEVELS.LIVE_LATEST.baseConfidence - 0.05,
        evidence: {
          origin: "pypi-latest",
          requiresPython: pypi.info.requires_python,
        },
      };
    }
  }

  // ---------- UNKNOWN ----------
  return {
    package: pkg,
    version: null,
    source: EVIDENCE_LEVELS.UNKNOWN.label,
    level: 99,
    confidence: EVIDENCE_LEVELS.UNKNOWN.baseConfidence,
    evidence: {},
  };
}

// ========================================================================
// 批量解析：先整体跑一次 RAG，再按包并发解析
// ========================================================================
export async function resolveAll(candidates, ctx = {}) {
  const ragResults = await ragLookup(candidates, {
    knownVersions: ctx.knownVersions || {},
  });

  const resolvedList = await pMap(
    candidates,
    async (pkg) => resolveOne(pkg, { ...ctx, ragResults }),
    6
  );

  const byName = {};
  resolvedList.forEach((r) => {
    byName[r.package] = r;
  });

  // 统计来源分布（供 UI 展示）
  const sourceBreakdown = {};
  resolvedList.forEach((r) => {
    sourceBreakdown[r.source] = (sourceBreakdown[r.source] || 0) + 1;
  });

  return {
    resolved: byName,
    list: resolvedList,
    sourceBreakdown,
    avgConfidence:
      resolvedList.reduce((s, r) => s + (r.confidence || 0), 0) /
      Math.max(1, resolvedList.length),
  };
}
