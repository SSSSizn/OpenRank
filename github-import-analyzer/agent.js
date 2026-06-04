// ========================================================================
// Agent Controller
// ------------------------------------------------------------------------
// 架构：Skill-based Agent with structured orchestration + ReAct fallback
//
// 本 Agent 运行两阶段：
//   Phase A: Perception —— 运行一组 Skill（顺序是固定的，因为 Skill 之间有
//           依赖关系：先拉 tree → 再扫 manifest → 再探信号 → 再识别类型）
//           这里不让 LLM 做 tool-choosing，因为顺序是确定的，不需要 LLM 决策。
//
//   Phase B: Decision  —— LLM 基于完整上下文（包括 RAG 检索结果 + 证据等级）
//           输出最终 requirements.txt + Dockerfile。这里 LLM 的角色是
//           "根据证据做整合"，不是"凭空生成"。
//
//   Phase C: Verification —— 调用 verifier 做 PyPI 存在性 + 兼容性检查，
//           发现幻觉则自动回填 resolver 推荐。
//
// 所有阶段的中间结果都会通过 emit() 广播到 sidepanel，形成可视化 Agent Trace。
// ========================================================================

import {
  fetchRepoTree,
  scanManifestFiles,
  detectRuntimeSignals,
  detectEntrypoint,
  extractProjectImports,
  detectProjectType,
} from "./skills.js";
import { resolveAll } from "./resolver.js";
import { verifyAndFix } from "./verifier.js";
import { getKBMetadata } from "./rag.js";
import { resolveSystemDeps, EVIDENCE_LEVELS } from "./utils.js";

// ========================================================================
// 事件广播
// ========================================================================
function emit(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function trace(step, action, observation = null, status = "ok") {
  emit("AGENT_TRACE", {
    trace: {
      step,
      action,
      observation,
      status,
      ts: Date.now(),
    },
  });
}

function log(text, level = "info") {
  emit("UPDATE_STATUS", { text, isError: level === "error" });
}

// ========================================================================
// Phase A — Perception
// 多个 Skill 按依赖顺序依次执行，构建完整 ctx
// ========================================================================
export async function runPerception(repoInfo) {
  const ctx = { repoInfo };

  // Step 1: 拉文件树
  trace(1, "fetch_repo_tree", null, "running");
  log("1/6 Fetching repo tree...");
  const treeResult = await fetchRepoTree(repoInfo);
  ctx.tree = treeResult.tree;
  ctx.branch = treeResult.branch;
  ctx.repoInfo = { ...repoInfo, branch: treeResult.branch };
  trace(1, "fetch_repo_tree", {
    files: ctx.tree.length,
    branch: ctx.branch,
  });

  // Step 2: 扫描已有 manifest
  trace(2, "scan_manifest_files", null, "running");
  log("2/6 Scanning dependency manifests...");
  const manifest = await scanManifestFiles({
    owner: ctx.repoInfo.owner,
    repo: ctx.repoInfo.repo,
    branch: ctx.branch,
    tree: ctx.tree,
  });
  ctx.manifest = manifest;
  trace(2, "scan_manifest_files", {
    found: manifest.found,
    declared: Object.keys(manifest.baseline).length,
  });

  // Step 3: 探测运行时信号
  trace(3, "detect_runtime_signals", null, "running");
  log("3/6 Detecting runtime signals (Python/CUDA/OS)...");
  const signals = await detectRuntimeSignals({
    owner: ctx.repoInfo.owner,
    repo: ctx.repoInfo.repo,
    branch: ctx.branch,
    tree: ctx.tree,
  });
  ctx.signals = signals;
  trace(3, "detect_runtime_signals", {
    pythonVersion: signals.pythonVersion,
    cuda: signals.cuda,
    baseImage: signals.baseImage,
    osDepsCount: signals.osDeps.length,
  });

  // Step 4: 抽取 imports
  trace(4, "extract_project_imports", null, "running");
  log("4/6 Extracting imports from .py files...");
  const impResult = await extractProjectImports({
    owner: ctx.repoInfo.owner,
    repo: ctx.repoInfo.repo,
    branch: ctx.branch,
    tree: ctx.tree,
  });
  ctx.imports = impResult.imports;
  trace(4, "extract_project_imports", {
    imports: impResult.imports.length,
    filesScanned: impResult.filesScanned,
  });

  // Step 5: 推断项目类型
  trace(5, "detect_project_type", null, "running");
  log("5/6 Classifying project type...");
  const typeResult = detectProjectType({ imports: ctx.imports, tree: ctx.tree });
  ctx.projectType = typeResult;
  trace(5, "detect_project_type", {
    type: typeResult.type,
    confidence: typeResult.confidence.toFixed(2),
    ranked: typeResult.ranked,
  });

  // Step 6: 推断入口
  trace(6, "detect_entrypoint", null, "running");
  log("6/6 Detecting entrypoint...");
  const ep = await detectEntrypoint({ tree: ctx.tree });
  ctx.entrypoint = ep;
  trace(6, "detect_entrypoint", { suggested: ep.suggested, cmd: ep.cmd });

  return ctx;
}

// ========================================================================
// Phase A' — Resolve Versions (六级证据分级)
// ========================================================================
export async function runResolve(ctx) {
  log("🔎 Resolving versions via evidence-ranked retrieval...");
  trace(7, "resolve_versions", null, "running");

  // 把 manifest 里已有的精确版本提取为 knownVersions
  const knownVersions = {};
  for (const [name, constraint] of Object.entries(ctx.manifest.baseline)) {
    const m = (constraint || "").match(/==\s*([\d\.\w]+)/);
    if (m) knownVersions[name] = m[1];
  }

  const resolveResult = await resolveAll(ctx.imports, {
    manifestBaseline: ctx.manifest.baseline,
    knownVersions,
  });

  ctx.resolve = resolveResult;
  trace(7, "resolve_versions", {
    total: ctx.imports.length,
    sourceBreakdown: resolveResult.sourceBreakdown,
    avgConfidence: resolveResult.avgConfidence.toFixed(2),
  });

  return ctx;
}

// ========================================================================
// Phase B — LLM Decision（受约束的生成）
// LLM 只能从证据中选版本，不能凭空编造
// ========================================================================
function buildEvidencePrompt(ctx) {
  const { resolve, projectType, signals, entrypoint, manifest } = ctx;

  // 把每个包的候选版本整理成 "约束候选集"
  const evidenceBlock = Object.values(resolve.resolved)
    .map((r) => {
      const confidence = (r.confidence * 100).toFixed(0);
      const alts =
        r.evidence?.alternatives?.length > 0
          ? ` (alts: ${r.evidence.alternatives
              .slice(0, 2)
              .map((a) => a.version)
              .join(", ")})`
          : "";
      const version = r.version || "UNKNOWN";
      return `- ${r.package}\n    chosen: ${version}\n    source: ${r.source} (level=${r.level}, conf=${confidence}%)${alts}`;
    })
    .join("\n");

  const sysDeps = resolveSystemDeps(ctx.imports);
  const sysDepsHint = sysDeps.length
    ? `\n\nDetected system-level (apt) dependencies needed: ${sysDeps.join(", ")}`
    : "";

  return `Role: Senior Python DevOps Engineer acting as a CONSTRAINED SYNTHESIZER.

Repository: ${ctx.repoInfo.owner}/${ctx.repoInfo.repo}
Project type: ${projectType.type} (conf=${(projectType.confidence * 100).toFixed(0)}%)
Python version target: ${signals.pythonVersion}
Base image hint: ${signals.baseImage || `python:${signals.pythonVersion}-slim`}
${signals.cuda ? `CUDA required: ${signals.cuda}` : ""}
Entrypoint: ${entrypoint.suggested || "unknown"} — suggested CMD: ${entrypoint.cmd}
Existing manifests: ${manifest.found.join(", ") || "none"}

=== EVIDENCE-BASED VERSION RESOLUTION ===
Each package below already has a version chosen by our 6-level evidence resolver
(manifest / RAG / local-KB / pypi-meta / live-latest).
You MUST use these exact versions unless they are "UNKNOWN".
For UNKNOWN entries, pick a reasonable stable version but set source="llm-unverified".

${evidenceBlock}
${sysDepsHint}

=== YOUR TASKS ===

1. Generate requirements.txt
   - One package per line, format: name==version
   - Use ONLY versions listed above for each package (do not invent)
   - If UNKNOWN, pick a widely-used stable version (mark as unverified in explanation)

2. Generate a production-ready Dockerfile
   - Use base image consistent with Python ${signals.pythonVersion}
   ${signals.cuda ? `- Use a CUDA-compatible base image (nvidia/cuda:${signals.cuda}-cudnn-runtime-ubuntu22.04 or similar)` : ""}
   - If system deps exist, use RUN apt-get update && apt-get install -y --no-install-recommends ...
   - Install deps via: COPY requirements.txt . && RUN pip install --no-cache-dir -r requirements.txt
   - Set WORKDIR /app
   - Use this CMD: ${entrypoint.cmd}

3. Provide an explanation BLOCK per package with STRICT format:
   <pkg>==<version>
     source: <manifest|rag|local-kb|pypi-meta|live-latest|llm-unverified>
     confidence: <0.0-1.0>
     reasoning:
       - <1 short bullet>

Return ONLY JSON:
{
  "requirements": "...",
  "dockerfile": "...",
  "explanation": "..."
}`;
}

export async function runDecision(ctx, llmConfig) {
  log("🤖 LLM synthesizing requirements & Dockerfile (evidence-bound)...");
  trace(8, "llm_synthesize", null, "running");

  emit("LLM_PROGRESS", {
    active: true,
    mode: "indeterminate",
    label: "正在请求 LLM（生成 requirements 与 Dockerfile）…",
  });

  const prompt = buildEvidencePrompt(ctx);
  const result = await callLLM(llmConfig, prompt);

  emit("LLM_PROGRESS", {
    active: true,
    mode: "determinate",
    percent: 50,
    label: "LLM 已完成，正在校验 PyPI 依赖…",
  });

  ctx.draft = result;
  trace(8, "llm_synthesize", {
    hasRequirements: !!result.requirements,
    hasDockerfile: !!result.dockerfile,
  });
  return ctx;
}

// ========================================================================
// Phase C — Verify & Fix
// ========================================================================
export async function runVerify(ctx) {
  trace(9, "verify_existence", null, "running");
  const verification = await verifyAndFix(
    ctx.draft.requirements || "",
    ctx.resolve,
    (msg) => log(msg)
  );
  ctx.verification = verification;

  trace(9, "verify_existence", {
    hallucinated: verification.hallucinated.length,
    conflicts: verification.compatibility.conflicts.length,
  });

  // 回填修正后的 requirements
  ctx.final = {
    requirements: verification.finalRequirements,
    dockerfile: ctx.draft.dockerfile,
    explanation: ctx.draft.explanation,
  };

  return ctx;
}

// ========================================================================
// LLM 调用（保留与原代码兼容）
// ========================================================================
async function callLLM(config, userPrompt) {
  const url = `${config.baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  const body = JSON.stringify({
    model: config.model,
    messages: [
      {
        role: "system",
        content:
          "You are a JSON generator. Return raw JSON only. Do not use Markdown code fences. Follow constraints strictly — never invent versions not listed in the evidence.",
      },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  let content = data.choices[0].message.content;
  content = content.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Failed to parse LLM JSON response.");
  }
}

// ========================================================================
// 顶层编排：完整 Agent 执行
// ========================================================================
export async function runFullAgent(repoInfo, llmConfig) {
  emit("AGENT_START", { repoInfo });

  // KB 元信息
  try {
    const kbMeta = await getKBMetadata();
    log(
      `📚 KB loaded: ${kbMeta.packageCount} packages, ${kbMeta.cooccurrenceCount} co-occurrence pairs`
    );
  } catch {}

  let ctx = await runPerception(repoInfo);
  emit("PERCEPTION_DONE", {
    summary: {
      imports: ctx.imports.length,
      projectType: ctx.projectType.type,
      pythonVersion: ctx.signals.pythonVersion,
      manifestFound: ctx.manifest.found,
      entrypoint: ctx.entrypoint.suggested,
    },
  });

  ctx = await runResolve(ctx);
  emit("RESOLVE_DONE", {
    resolve: ctx.resolve,
  });

  if (!llmConfig || !llmConfig.apiKey) {
    emit("AGENT_WAIT_LLM", {});
    return ctx; // 等用户配置 LLM 后再继续
  }

  ctx = await runDecision(ctx, llmConfig);
  ctx = await runVerify(ctx);

  emit("AGENT_RESULT", {
    data: {
      requirements: ctx.final.requirements,
      dockerfile: ctx.final.dockerfile,
      explanation: ctx.final.explanation,
      verification: ctx.verification,
      evidence: Object.values(ctx.resolve.resolved).map((r) => ({
        package: r.package,
        version: r.version,
        source: r.source,
        confidence: r.confidence,
        level: r.level,
      })),
      projectType: ctx.projectType,
      signals: ctx.signals,
    },
  });

  return ctx;
}

// 只跑 LLM 阶段（当 perception 结果已缓存时）
export async function runDecisionOnly(ctx, llmConfig) {
  ctx = await runDecision(ctx, llmConfig);
  ctx = await runVerify(ctx);

  emit("AGENT_RESULT", {
    data: {
      requirements: ctx.final.requirements,
      dockerfile: ctx.final.dockerfile,
      explanation: ctx.final.explanation,
      verification: ctx.verification,
      evidence: Object.values(ctx.resolve.resolved).map((r) => ({
        package: r.package,
        version: r.version,
        source: r.source,
        confidence: r.confidence,
        level: r.level,
      })),
      projectType: ctx.projectType,
      signals: ctx.signals,
    },
  });
  return ctx;
}
