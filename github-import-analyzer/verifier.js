// ========================================================================
// Post-Generation Verifier
// ------------------------------------------------------------------------
// 核心职责：
//   1) Existence Check —— 真的去 PyPI 查"这个 pkg==version"是否真实存在，
//      检测 LLM 幻觉出的版本号
//   2) Compatibility Check —— 利用 requires_dist 做轻量约束检查
//   3) Auto-Fix —— 对检出的问题自动回退到 resolver 给出的安全版本
// ========================================================================

import { fetchWithTimeout, pMap, compareSemver } from "./utils.js";

// ------------------------------------------------------------------------
// 解析 requirements.txt 文本 → [{name, version, constraint}]
// ------------------------------------------------------------------------
export function parseRequirementsText(text) {
  const lines = text.split("\n");
  const parsed = [];
  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line || line.startsWith("-")) continue;
    const m = line.match(/^([A-Za-z0-9_\-\.]+)(?:\[[^\]]+\])?\s*([<>=!~].+)?$/);
    if (!m) continue;
    const name = m[1];
    const constraint = (m[2] || "").trim();
    const verM = constraint.match(/==\s*([\d\.\w\-+]+)/);
    parsed.push({
      name,
      version: verM ? verM[1] : null,
      constraint: constraint || null,
      raw: line,
    });
  }
  return parsed;
}

// ------------------------------------------------------------------------
// 序列化回 requirements.txt
// ------------------------------------------------------------------------
export function serializeRequirements(parsed) {
  return parsed
    .map((p) => {
      if (p.version) return `${p.name}==${p.version}`;
      if (p.constraint) return `${p.name}${p.constraint}`;
      return p.name;
    })
    .join("\n");
}

// ------------------------------------------------------------------------
// Existence Check: 逐包查 pypi.org/pypi/{pkg}/{ver}/json
// ------------------------------------------------------------------------
async function checkOneExists(name, version) {
  if (!version) return { ok: true, reason: "no-version" };
  try {
    const res = await fetchWithTimeout(
      `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`,
      {},
      5000
    );
    if (res.ok) return { ok: true };
    if (res.status === 404) {
      // 包本身是否存在？
      const packageRes = await fetchWithTimeout(
        `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
        {},
        5000
      );
      if (!packageRes.ok) {
        return { ok: false, reason: "package-not-found" };
      }
      return { ok: false, reason: "version-not-found" };
    }
    return { ok: false, reason: `http-${res.status}` };
  } catch {
    return { ok: false, reason: "network-error" };
  }
}

export async function verifyExistence(parsed) {
  const report = await pMap(
    parsed,
    async (p) => {
      const check = await checkOneExists(p.name, p.version);
      return { ...p, ...check };
    },
    6
  );

  const hallucinated = report.filter((r) => !r.ok);
  return { report, hallucinated, allOk: hallucinated.length === 0 };
}

// ------------------------------------------------------------------------
// Compatibility Check: 轻量版
// 策略：拉取每个包的 requires_dist，检查是否与当前 requirements 冲突
// （完整 SAT 求解成本过高，这里只做 "显式冲突" 检测）
// ------------------------------------------------------------------------
async function getRequiresDist(name, version) {
  try {
    const url = version
      ? `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
      : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    return data.info?.requires_dist || [];
  } catch {
    return null;
  }
}

// 解析 "foo (>=1.0,<2.0)"  或  "bar ; python_version < '3.10'"
function parseRequiresDist(line) {
  if (!line) return null;
  // 忽略带环境标记的（简化处理）
  const main = line.split(";")[0].trim();
  const m = main.match(/^([A-Za-z0-9_\-\.]+)(?:\[[^\]]+\])?\s*(.*)$/);
  if (!m) return null;
  return { name: m[1].toLowerCase(), spec: (m[2] || "").trim() };
}

// 简易 version 满足判断（支持 ==, >=, <=, <, >）
function satisfiesSpec(version, spec) {
  if (!spec || !version) return true;
  const clauses = spec.replace(/[()]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const clause of clauses) {
    const m = clause.match(/^(==|>=|<=|<|>|~=|!=)\s*([\d\.\w\-+]+)/);
    if (!m) continue;
    const [, op, ref] = m;
    const cmp = compareSemver(version, ref);
    const ok =
      (op === "==" && cmp === 0) ||
      (op === ">=" && cmp >= 0) ||
      (op === "<=" && cmp <= 0) ||
      (op === ">" && cmp > 0) ||
      (op === "<" && cmp < 0) ||
      (op === "!=" && cmp !== 0) ||
      (op === "~=" && cmp >= 0); // 近似兼容（简化）
    if (!ok) return false;
  }
  return true;
}

export async function checkCompatibility(parsed) {
  const byName = {};
  parsed.forEach((p) => (byName[p.name.toLowerCase()] = p));

  const conflicts = [];
  // 只检查显式指定了版本的包
  const toCheck = parsed.filter((p) => p.version);

  await pMap(
    toCheck,
    async (p) => {
      const deps = await getRequiresDist(p.name, p.version);
      if (!deps) return;
      for (const raw of deps) {
        const parsedDep = parseRequiresDist(raw);
        if (!parsedDep) continue;
        const existing = byName[parsedDep.name];
        if (!existing || !existing.version) continue;
        if (!satisfiesSpec(existing.version, parsedDep.spec)) {
          conflicts.push({
            root: `${p.name}==${p.version}`,
            requires: raw,
            actual: `${existing.name}==${existing.version}`,
          });
        }
      }
    },
    4
  );

  return { conflicts, ok: conflicts.length === 0 };
}

// ------------------------------------------------------------------------
// Auto-Fix：用 resolver 的建议回填幻觉/冲突包
// ------------------------------------------------------------------------
export function autoFix(parsed, resolverResult) {
  const fixed = [];
  const fixLog = [];

  for (const item of parsed) {
    if (item.ok === false) {
      const nameLower = item.name.toLowerCase();
      // 找 resolver 里对应的建议
      const suggestion =
        resolverResult.resolved[item.name] ||
        resolverResult.resolved[nameLower] ||
        Object.values(resolverResult.resolved).find(
          (r) => r.package.toLowerCase() === nameLower
        );

      if (suggestion && suggestion.version) {
        fixed.push({ ...item, version: suggestion.version, ok: true, fixed: true });
        fixLog.push({
          package: item.name,
          from: item.version,
          to: suggestion.version,
          reason: item.reason,
          source: suggestion.source,
        });
      } else {
        fixed.push({ ...item, version: null, fixed: false });
        fixLog.push({
          package: item.name,
          from: item.version,
          to: null,
          reason: item.reason,
          source: "dropped",
        });
      }
    } else {
      fixed.push(item);
    }
  }

  return { fixed, fixLog };
}

// ------------------------------------------------------------------------
// Orchestration: 生成后完整校验管线
// ------------------------------------------------------------------------
export async function verifyAndFix(requirementsText, resolverResult, onProgress) {
  const parsed = parseRequirementsText(requirementsText);

  onProgress?.("🔍 Verifying package existence on PyPI...");
  const existence = await verifyExistence(parsed);

  let working = existence.report;

  if (existence.hallucinated.length > 0) {
    onProgress?.(`⚠️  Found ${existence.hallucinated.length} hallucinated version(s). Auto-fixing...`);
    const { fixed, fixLog } = autoFix(working, resolverResult);
    working = fixed;
    onProgress?.(
      `✅ Repaired: ${fixLog
        .filter((l) => l.source !== "dropped")
        .map((l) => `${l.package} ${l.from || "?"} → ${l.to}`)
        .join(", ") || "(none)"}`
    );
  } else {
    onProgress?.("✅ All versions verified on PyPI.");
  }

  onProgress?.("🧩 Checking dependency compatibility...");
  const compat = await checkCompatibility(working);
  if (compat.conflicts.length > 0) {
    onProgress?.(`⚠️  Detected ${compat.conflicts.length} compatibility conflict(s).`);
  } else {
    onProgress?.("✅ No obvious compatibility conflicts.");
  }

  return {
    finalRequirements: serializeRequirements(working),
    existenceReport: existence.report,
    hallucinated: existence.hallucinated,
    compatibility: compat,
    parsedFinal: working,
  };
}
