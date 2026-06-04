// ========================================================================
// RAG-like Retrieval
// ------------------------------------------------------------------------
// 思路：
//   - 把 dependency_version_knowledge.json 当作一个"离线文档库"
//   - 每个 version_cooccurrence 条目 = 一条证据（"在历史某项目中，这两个
//     包以这个版本同时出现过"）
//   - 给定用户项目的 imports + 已知版本，对每个目标包：
//       找到所有包含该包的共现条目
//       按命中数（与用户已知包匹配的程度）加权投票
//       得到候选版本 + 置信度
//
// 这是一个 "evidence-grounded" 的检索：LLM 无法编造未在证据中出现过的
// 版本号，直接堵死了幻觉入口。
// ========================================================================

let _kbCache = null;

// 加载本地知识库（带缓存）
export async function loadKnowledgeBase() {
  if (_kbCache) return _kbCache;
  const res = await fetch(chrome.runtime.getURL("dependency_version_knowledge.json"));
  _kbCache = await res.json();
  return _kbCache;
}

// 解析共现条目：格式 "pkg_a==ver_a || pkg_b==ver_b"
function parseCooccurrenceKey(key) {
  const parts = key.split("||").map((s) => s.trim());
  return parts
    .map((p) => {
      const idx = p.lastIndexOf("==");
      if (idx < 0) return null;
      return { name: p.slice(0, idx).toLowerCase(), version: p.slice(idx + 2) };
    })
    .filter(Boolean);
}

// ========================================================================
// 核心 RAG 检索：为每个候选包，基于共现证据投票得出最佳版本
// ========================================================================
export async function ragLookup(candidates, { knownVersions = {} } = {}) {
  const kb = await loadKnowledgeBase();
  const candidateSet = new Set(candidates.map((c) => c.toLowerCase()));

  // 1. 预处理：把共现条目按包名建索引
  const indexByPkg = {}; // pkg -> [ {pairKey, entries:[{name, version}], count} ]
  for (const [key, count] of Object.entries(kb.version_cooccurrence || {})) {
    const entries = parseCooccurrenceKey(key);
    if (entries.length < 2) continue;
    entries.forEach(({ name }) => {
      if (!indexByPkg[name]) indexByPkg[name] = [];
      indexByPkg[name].push({ key, entries, count });
    });
  }

  // 2. 为每个候选包做一次 RAG 检索
  const results = {};
  for (const pkg of candidates) {
    const name = pkg.toLowerCase();
    const entries = indexByPkg[name] || [];
    if (entries.length === 0) {
      results[pkg] = null; // 没有共现证据
      continue;
    }

    // 每条证据权重 = count × Σ(与用户已知包匹配的 bonus)
    const versionScores = {}; // version -> { score, support, evidences }
    for (const { entries: pairEntries, count } of entries) {
      const self = pairEntries.find((e) => e.name === name);
      if (!self) continue;
      const partners = pairEntries.filter((e) => e.name !== name);

      // 计算 relevance：
      //   partner 也是用户候选包 → +2
      //   partner 已有已知版本且匹配 → +3
      //   partner 不是候选 → +0.5（弱证据，仍有用）
      let relevance = 0;
      partners.forEach((p) => {
        if (knownVersions[p.name] === p.version) relevance += 3;
        else if (candidateSet.has(p.name)) relevance += 2;
        else relevance += 0.5;
      });

      const weight = count * Math.max(0.5, relevance);
      if (!versionScores[self.version]) {
        versionScores[self.version] = { score: 0, support: 0, evidences: [] };
      }
      versionScores[self.version].score += weight;
      versionScores[self.version].support += count;
      if (versionScores[self.version].evidences.length < 3) {
        versionScores[self.version].evidences.push(
          partners.map((p) => `${p.name}==${p.version}`).join(" + ")
        );
      }
    }

    // 3. 排序取 top
    const sorted = Object.entries(versionScores).sort((a, b) => b[1].score - a[1].score);
    if (sorted.length === 0) {
      results[pkg] = null;
      continue;
    }

    const [topVer, topInfo] = sorted[0];
    const totalScore = sorted.reduce((s, [_, v]) => s + v.score, 0);
    const voteRatio = topInfo.score / totalScore;

    // 置信度：投票一致性 + 证据体量
    const confidence = Math.min(
      0.95,
      0.5 + voteRatio * 0.3 + Math.min(topInfo.support / 20, 0.15)
    );

    results[pkg] = {
      version: topVer,
      confidence,
      support: topInfo.support,
      voteRatio,
      topEvidences: topInfo.evidences,
      alternatives: sorted.slice(1, 4).map(([v, info]) => ({
        version: v,
        score: info.score,
        support: info.support,
      })),
    };
  }

  return results;
}

// ========================================================================
// 附加：基于 package_versions 的单包统计兜底（原有本地 KB 能力保留）
// ========================================================================
export async function statsLookup(pkg) {
  const kb = await loadKnowledgeBase();
  const name = pkg.toLowerCase();
  const versions = kb.package_versions?.[name];
  if (!versions) return null;

  const sorted = Object.entries(versions).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const [topVer, count] = sorted[0];
  return {
    version: topVer,
    confidence: Math.min(0.9, 0.5 + count / 50),
    support: count,
    distribution: Object.fromEntries(sorted.slice(0, 5)),
  };
}

// ========================================================================
// KB 元信息（版本号、包覆盖数等）供 UI 展示
// ========================================================================
export async function getKBMetadata() {
  const kb = await loadKnowledgeBase();
  return {
    version: kb.version || "snapshot-2025",
    packageCount: Object.keys(kb.package_versions || {}).length,
    cooccurrenceCount: Object.keys(kb.version_cooccurrence || {}).length,
  };
}
