from flask import Flask, render_template, jsonify, request
import json
from pathlib import Path
import os
import statistics
import re
from collections import Counter
import threading
import requests
from flask import request, jsonify
from openai import OpenAI


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / 'data_analysis'

app = Flask(__name__, static_folder='static', template_folder='templates')

SAMPLED_PREFIX = 'sampled'
DATA_CACHE = {}
REPO_INDEX = {}
CACHE_LOCK = threading.Lock()


# --- 辅助函数 ---

def simple_tokenize(text):
    if not text:
        return []
    # 简单的分词逻辑
    s = str(text).lower().replace('.', ' ').replace('/', ' ').replace('\\', ' ').replace('-', ' ').replace('_', ' ')
    return [t for t in s.split() if len(t) >= 3 and t.isalpha()]


def get_top_tokens(counter, limit=200):
    common = counter.most_common(limit)
    if not common:
        return []
    max_val = common[0][1]
    min_val = common[-1][1]
    result = []
    for word, count in common:
        if max_val == min_val:
            weight = 30
        else:
            weight = 10 + (count - min_val) / (max_val - min_val) * 50
        result.append([word, int(weight)])
    return result



def summary_dependency_overview(data):
    rows = data if isinstance(data, list) else list(data.values())
    total = len(rows)
    has_dep_counts = Counter()
    dep_file_types = Counter()
    ratios = []
    token_counter = Counter()

    for r in rows:
        if isinstance(r, dict):
            has_dep = r.get('has_dependency_file', False)
            has_dep_counts[str(has_dep)] += 1

            files = r.get('dependency_files', [])
            for f in files:
                dep_file_types[f] += 1
                for t in simple_tokenize(f):
                    token_counter[t] += 1

            # 安全检查 is not None
            v = r.get('readme_env_ratio')
            if v is not None: ratios.append(v)

    return {
        'type': 'dependency_overview',
        'total': total,
        'has_dependency_file': dict(has_dep_counts),
        'dependency_files': dict(dep_file_types),
        'readme_env_ratio_mean': statistics.mean(ratios) if ratios else 0,
        'tokens_top': get_top_tokens(token_counter)
    }


def summary_dependency_staleness(data):
    rows = data if isinstance(data, list) else list(data.values())
    # 安全检查 is not None
    days_repo = [r['max_staleness_vs_repo_days'] for r in rows if
                 isinstance(r, dict) and r.get('max_staleness_vs_repo_days') is not None]
    days_now = [r['max_staleness_vs_now_days'] for r in rows if
                isinstance(r, dict) and r.get('max_staleness_vs_now_days') is not None]

    return {
        'type': 'dependency_staleness',
        'total': len(rows),
        'days_behind_repo_mean': statistics.mean(days_repo) if days_repo else 0,
        'days_behind_now_mean': statistics.mean(days_now) if days_now else 0,
        'tokens_top': []
    }


def summary_import_vs_requirements(data):
    rows = data if isinstance(data, list) else list(data.values())
    # 修复潜在报错：检查 key 存在且不为 None
    missing = [r['missing_ratio'] for r in rows if isinstance(r, dict) and r.get('missing_ratio') is not None]
    redundant = [r['redundant_ratio'] for r in rows if isinstance(r, dict) and r.get('redundant_ratio') is not None]

    import_words = Counter()
    for r in rows:
        if isinstance(r, dict):
            for imp in r.get('imports', []):
                for p in simple_tokenize(imp):
                    import_words[p] += 1

    return {
        'type': 'import_vs_requirements',
        'total': len(rows),
        'missing_ratio_mean': statistics.mean(missing) if missing else 0,
        'redundant_ratio_mean': statistics.mean(redundant) if redundant else 0,
        'tokens_top': get_top_tokens(import_words)
    }


def summary_issue_env_stats(data):
    rows = data if isinstance(data, list) else list(data.values())
    # 之前是 'env_issue_ratio' in r，现在加了 r.get(...) is not None
    ratios = [r['env_issue_ratio'] for r in rows if isinstance(r, dict) and r.get('env_issue_ratio') is not None]

    kw_counter = Counter()
    for r in rows:
        if isinstance(r, dict):
            for kw, cnt in r.get('keyword_hits', {}).items():
                kw_counter[kw] += cnt

    return {
        'type': 'issue_env_stats',
        'total': len(rows),
        'env_issue_ratio_mean': statistics.mean(ratios) if ratios else 0,
        'tokens_top': get_top_tokens(kw_counter)
    }


def summary_onboarding_stats(data):
    rows = data if isinstance(data, list) else list(data.values())
    contributing_ratios = []
    newcomer_env_ratios = []
    newcomer_kw = Counter()
    newcomer_fail_ratios = []

    for r in rows:
        if isinstance(r, dict):
            if 'contributing' in r and isinstance(r['contributing'], dict):
                v = r['contributing'].get('env_ratio')
                if v is not None: contributing_ratios.append(v)

            if 'newcomer_issues' in r and isinstance(r['newcomer_issues'], dict):
                v = r['newcomer_issues'].get('env_ratio')
                if v is not None: newcomer_env_ratios.append(v)
                for kw, cnt in r['newcomer_issues'].get('keyword_hits', {}).items():
                    newcomer_kw[kw] += cnt

            if 'newcomer_prs' in r and isinstance(r['newcomer_prs'], dict):
                v = r['newcomer_prs'].get('env_fail_ratio')
                if v is not None: newcomer_fail_ratios.append(v)

    return {
        'type': 'onboarding_stats',
        'total': len(rows),
        'contributing_env_ratio_mean': statistics.mean(contributing_ratios) if contributing_ratios else 0,
        'newcomer_issues_env_ratio_mean': statistics.mean(newcomer_env_ratios) if newcomer_env_ratios else 0,
        'newcomer_prs_env_fail_ratio_mean': statistics.mean(newcomer_fail_ratios) if newcomer_fail_ratios else 0,
        'tokens_top': get_top_tokens(newcomer_kw)
    }


def compute_summary_logic(filename, data):
    if 'dependency_overview' in filename:
        return summary_dependency_overview(data)
    elif 'dependency_staleness' in filename:
        return summary_dependency_staleness(data)
    elif 'import_vs_requirements' in filename:
        return summary_import_vs_requirements(data)
    elif 'issue_env_stats' in filename:
        return summary_issue_env_stats(data)
    elif 'onboarding_stats' in filename:
        return summary_onboarding_stats(data)
    else:
        rows = data if isinstance(data, list) else list(data.values())
        return {
            'type': 'generic',
            'total': len(rows),
            'tokens_top': []
        }


def load_and_cache_data():
    global REPO_INDEX

    if not DATA_DIR.exists():
        print(f"Data directory not found: {DATA_DIR}")
        return

    with CACHE_LOCK:
        current_files = []
        for p in DATA_DIR.rglob('*.json'):
            if p.name.lower().startswith(SAMPLED_PREFIX) and 'buckets' not in p.name.lower():
                rel_path = str(p.relative_to(DATA_DIR)).replace('\\', '/')
                current_files.append((rel_path, p))

        files_updated = False
        for rel, path in current_files:
            mtime = os.path.getmtime(path)
            if rel not in DATA_CACHE or DATA_CACHE[rel]['mtime'] != mtime:
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    summary = compute_summary_logic(rel, data)

                    DATA_CACHE[rel] = {
                        'data': data,
                        'mtime': mtime,
                        'summary': summary
                    }
                    files_updated = True
                except Exception as e:
                    print(f"Error loading {rel}: {e}")

        if files_updated:
            new_index = {}
            for fname, cache_item in DATA_CACHE.items():
                data = cache_item['data']
                rows = data if isinstance(data, list) else list(data.values())
                for item in rows:
                    if isinstance(item, dict):
                        full = item.get('full_name') or item.get('repository') or item.get('fullName')
                        if full:
                            full = str(full).lower()
                            if full not in new_index:
                                new_index[full] = []
                            new_index[full].append({
                                'file': fname,
                                'record': item
                            })

            REPO_INDEX = new_index


# --- 初始化 ---
load_and_cache_data()

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/files')
def api_files():
    return jsonify(sorted(list(DATA_CACHE.keys())))


@app.route('/api/data')
def api_data():
    name = request.args.get('name')
    if name in DATA_CACHE:
        return jsonify(DATA_CACHE[name]['data'])
    return jsonify({'error': 'file not found'}), 404


@app.route('/api/summary')
def api_summary():
    name = request.args.get('name')
    if name in DATA_CACHE:
        return jsonify(DATA_CACHE[name]['summary'])
    load_and_cache_data()
    if name in DATA_CACHE:
        return jsonify(DATA_CACHE[name]['summary'])
    return jsonify({'error': 'file not found'}), 404


@app.route('/api/search')
def api_search():
    q = request.args.get('q', '').strip().lower()
    if not q: return jsonify([])
    results = []
    limit = 20
    count = 0
    for full_name, infos in REPO_INDEX.items():
        if q in full_name:
            for info in infos:  # 遍历该仓库的所有文件
                results.append({
                    'file': info.get('file', '未知文件'),
                    'record': info.get('record', {}),
                    'full_name': info.get('record', {}).get('full_name')
                })
                count += 1
                if count >= limit:
                    break
            if count >= limit:
                break
    return jsonify(results)


@app.route('/api/repos-list')
def api_repos_list():
    return jsonify(sorted(list(REPO_INDEX.keys())))


@app.route('/api/repo')
def api_repo():
    full = request.args.get('full_name', '').strip().lower()

    if full not in REPO_INDEX:
        return jsonify({'matches': [], 'visualizations': {}})

    infos = REPO_INDEX[full]   # 多个统计文件
    matches = []
    viz = {}

    for info in infos:
        fname = info.get('file', '')
        rec = info.get('record', {})

        matches.append({
            'file': fname or '未知文件',
            'record': rec
        })

        # ===== 逐文件补全 visualization =====
        if 'dependency_overview' in fname:
            viz['dependency_overview'] = {
                'has_dependency_file': rec.get('has_dependency_file', False),
                'readme_env_ratio': rec.get('readme_env_ratio', 0),
                'readme_total_lines': rec.get('readme_total_lines', 0),
                'readme_env_lines': rec.get('readme_env_lines', 0),
                'dependency_files': rec.get('dependency_files', [])
            }

        if 'dependency_staleness' in fname:
            viz['dependency_staleness'] = {
                'days_behind_repo': rec.get('max_staleness_vs_repo_days', 0),
                'days_behind_now': rec.get('max_staleness_vs_now_days', 0)
            }

        if 'import_vs_requirements' in fname:
            viz['import_vs_requirements'] = {
                'missing_ratio': rec.get('missing_ratio', 0),
                'redundant_ratio': rec.get('redundant_ratio', 0),
                'imports': rec.get('imports', [])
            }

        if 'issue_env_stats' in fname:
            viz['issue_env_stats'] = {
                'env_issue_ratio': rec.get('env_issue_ratio', 0),
                'keyword_hits': rec.get('keyword_hits', {})
            }

        if 'onboarding_stats' in fname:
            viz['onboarding_stats'] = {
                'contributing': rec.get('contributing', {}),
                'newcomer_issues': rec.get('newcomer_issues', {}),
                'newcomer_prs': rec.get('newcomer_prs', {})
            }

    print(f"[api_repo] {full} viz keys:", list(viz.keys()))

    return jsonify({
        'matches': matches,
        'visualizations': viz
    })

# ===== 硅基流动配置 =====
# 删掉下划线
SILICONFLOW_API_KEY = "123"
SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1"
SILICONFLOW_MODEL = "deepseek-ai/DeepSeek-V3.2-Exp"

client = OpenAI(
    api_key=SILICONFLOW_API_KEY,
    base_url=SILICONFLOW_BASE_URL
)

@app.route('/api/repo-ai', methods=['POST'])
def repo_ai():
    data = request.json or {}
    summary = data.get('summary', [])
    full_name = data.get('full_name', '')

    prompt = (
        "你是软件工程分析助手，请基于以下仓库统计结果，"
        "用 5-8 句话分析环境依赖复杂度、新手友好程度，"
        "并指出潜在问题与改进建议。\n\n"
        f"仓库：{full_name}\n"
        + "\n".join(summary)
    )

    try:
        resp = client.chat.completions.create(
            model=SILICONFLOW_MODEL,
            messages=[
                {"role": "system", "content": "你是严谨的软件工程研究分析助手"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=512
        )

        text = resp.choices[0].message.content
        return jsonify({"analysis": text})

    except Exception as e:
        print("AI ERROR:", repr(e))
        return jsonify({
            "error": "AI analysis failed",
            "detail": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)