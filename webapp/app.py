from flask import Flask, render_template, jsonify, request, send_from_directory, abort
import json
from pathlib import Path
import os
import statistics
import re
from collections import Counter, defaultdict

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / 'data_analysis'

app = Flask(__name__, static_folder='static', template_folder='templates')


SAMPLED_PREFIX = 'sampled'


def list_json_files():
    files = []
    if DATA_DIR.exists():
        for p in DATA_DIR.rglob('*.json'):
            # only include files that start with sampled_ but not buckets
            if p.name.lower().startswith(SAMPLED_PREFIX) and 'buckets' not in p.name.lower():
                rel = p.relative_to(DATA_DIR)
                files.append(str(rel).replace('\\', '/'))
    return sorted(files)


def safe_read_json(relpath):
    # prevent path traversal
    target = (DATA_DIR / relpath).resolve()
    try:
        target.relative_to(DATA_DIR.resolve())
    except Exception:
        raise FileNotFoundError
    with open(target, 'r', encoding='utf-8') as f:
        return json.load(f)


def tokenize(text):
    if not text:
        return []
    text = re.sub(r"[^0-9a-zA-Z_\\u4e00-\\u9fff]+", ' ', str(text))
    parts = [p.lower() for p in text.split() if len(p) >= 2]
    return parts


def summary_dependency_overview(data):
    rows = data if isinstance(data, list) else list(data.values())
    total = len(rows)
    has_dep_counts = Counter()
    dep_file_types = Counter()
    ratios = []
    total_lines_list = []
    env_lines_list = []
    
    for r in rows:
        if isinstance(r, dict):
            has_dep = r.get('has_dependency_file', False)
            has_dep_counts[str(has_dep)] += 1
            for f in r.get('dependency_files', []):
                dep_file_types[f] += 1
            v = r.get('readme_env_ratio')
            if v is not None:
                ratios.append(v)
            v = r.get('readme_total_lines')
            if v is not None:
                total_lines_list.append(v)
            v = r.get('readme_env_lines')
            if v is not None:
                env_lines_list.append(v)
    # aggregate tokens across all rows for wordcloud: use repository full_name and dependency_files
    token_counter = Counter()
    for r in rows:
        if isinstance(r, dict):
            fn = r.get('full_name') or ''
            for t in tokenize(fn):
                token_counter[t] += 1
            for f in r.get('dependency_files', []):
                for t in tokenize(f):
                    token_counter[t] += 1
    
    return {
        'type': 'dependency_overview',
        'total': total,
        'has_dependency_file': dict(has_dep_counts),
        'dependency_files': dict(dep_file_types),
        'readme_env_ratio_mean': statistics.mean(ratios) if ratios else 0,
        'readme_total_lines_mean': statistics.mean(total_lines_list) if total_lines_list else 0,
        'readme_env_lines_mean': statistics.mean(env_lines_list) if env_lines_list else 0,
        'tokens_top': token_counter.most_common(100)
    }


def summary_dependency_staleness(data):
    rows = data if isinstance(data, list) else list(data.values())
    days_behind_repo = []
    days_behind_now = []
    
    for r in rows:
        if isinstance(r, dict):
            if r.get('max_staleness_vs_repo_days') is not None:
                days_behind_repo.append(r['max_staleness_vs_repo_days'])
            if r.get('max_staleness_vs_now_days') is not None:
                days_behind_now.append(r['max_staleness_vs_now_days'])
    
    return {
        'type': 'dependency_staleness',
        'total': len(rows),
        'days_behind_repo_mean': statistics.mean(days_behind_repo) if days_behind_repo else 0,
        'days_behind_now_mean': statistics.mean(days_behind_now) if days_behind_now else 0,
        'tokens_top': []
    }


def summary_import_vs_requirements(data):
    rows = data if isinstance(data, list) else list(data.values())
    missing_ratios = []
    redundant_ratios = []
    import_words = Counter()
    
    for r in rows:
        if isinstance(r, dict):
            if 'missing_ratio' in r:
                missing_ratios.append(r['missing_ratio'])
            if 'redundant_ratio' in r:
                redundant_ratios.append(r['redundant_ratio'])
            for imp in r.get('imports', []):
                parts = tokenize(imp)
                for p in parts:
                    import_words[p] += 1
    
    return {
        'type': 'import_vs_requirements',
        'total': len(rows),
        'missing_ratio_mean': statistics.mean(missing_ratios) if missing_ratios else 0,
        'redundant_ratio_mean': statistics.mean(redundant_ratios) if redundant_ratios else 0,
        'tokens_top': import_words.most_common(100)
    }


def summary_issue_env_stats(data):
    rows = data if isinstance(data, list) else list(data.values())
    env_ratios = []
    kw_counter = Counter()
    
    for r in rows:
        if isinstance(r, dict):
            v = r.get('env_issue_ratio')
            if v is not None:
                env_ratios.append(v)
            for kw, cnt in r.get('keyword_hits', {}).items():
                kw_counter[kw] += cnt
    
    return {
        'type': 'issue_env_stats',
        'total': len(rows),
        'env_issue_ratio_mean': statistics.mean(env_ratios) if env_ratios else 0,
        'tokens_top': kw_counter.most_common(100)
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
                if v is not None:
                    contributing_ratios.append(v)
            if 'newcomer_issues' in r and isinstance(r['newcomer_issues'], dict):
                v = r['newcomer_issues'].get('env_ratio')
                if v is not None:
                    newcomer_env_ratios.append(v)
                for kw, cnt in r['newcomer_issues'].get('keyword_hits', {}).items():
                    newcomer_kw[kw] += cnt
            if 'newcomer_prs' in r and isinstance(r['newcomer_prs'], dict):
                v = r['newcomer_prs'].get('env_fail_ratio')
                if v is not None:
                    newcomer_fail_ratios.append(v)
    
    return {
        'type': 'onboarding_stats',
        'total': len(rows),
        'contributing_env_ratio_mean': statistics.mean(contributing_ratios) if contributing_ratios else 0,
        'newcomer_issues_env_ratio_mean': statistics.mean(newcomer_env_ratios) if newcomer_env_ratios else 0,
        'newcomer_prs_env_fail_ratio_mean': statistics.mean(newcomer_fail_ratios) if newcomer_fail_ratios else 0,
        'tokens_top': newcomer_kw.most_common(100)
    }


def compute_summary_for_data(filename, data):
    # Route to appropriate summary function based on filename
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


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/files')
def api_files():
    return jsonify(list_json_files())


@app.route('/api/data')
def api_data():
    name = request.args.get('name')
    if not name:
        return jsonify({'error': 'missing name parameter'}), 400
    try:
        data = safe_read_json(name)
    except FileNotFoundError:
        return jsonify({'error': 'file not found'}), 404
    return jsonify(data)


@app.route('/api/summary')
def api_summary():
    name = request.args.get('name')
    if not name:
        return jsonify({'error': 'missing name parameter'}), 400
    try:
        data = safe_read_json(name)
    except FileNotFoundError:
        return jsonify({'error': 'file not found'}), 404
    summary = compute_summary_for_data(name, data)
    return jsonify(summary)


@app.route('/api/search')
def api_search():
    q = request.args.get('q', '').strip().lower()
    if not q:
        return jsonify([])
    results = []
    for fname in list_json_files():
        try:
            data = safe_read_json(fname)
        except Exception:
            continue
        # data can be list or dict
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    full = item.get('full_name') or item.get('repository') or item.get('fullName') or ''
                    if full and q in str(full).lower():
                        results.append({'file': fname, 'record': item})
        elif isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict):
                    full = v.get('full_name') or v.get('repository') or v.get('fullName') or ''
                    if full and q in str(full).lower():
                        results.append({'file': fname, 'key': k, 'record': v})
    return jsonify(results)


@app.route('/api/repos-list')
def api_repos_list():
    """Get list of all unique repositories across all files"""
    repos = set()
    for fname in list_json_files():
        try:
            data = safe_read_json(fname)
        except Exception:
            continue
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    full = item.get('full_name') or item.get('repository') or item.get('fullName') or ''
                    if full:
                        repos.add(full)
        elif isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict):
                    full = v.get('full_name') or v.get('repository') or v.get('fullName') or ''
                    if full:
                        repos.add(full)
    return jsonify(sorted(list(repos)))


@app.route('/api/repo')
def api_repo():
    full = request.args.get('full_name', '').strip().lower()
    if not full:
        return jsonify({'error': 'missing full_name parameter'}), 400
    matches = []
    for fname in list_json_files():
        try:
            data = safe_read_json(fname)
        except Exception:
            continue
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    fn = (item.get('full_name') or item.get('repository') or item.get('fullName') or '').lower()
                    if fn == full:
                        matches.append({'file': fname, 'record': item})
        elif isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict):
                    fn = (v.get('full_name') or v.get('repository') or v.get('fullName') or '').lower()
                    if fn == full:
                        matches.append({'file': fname, 'key': k, 'record': v})

    # Build file-specific visualizations
    viz = {}
    for m in matches:
        fname = m['file']
        rec = m['record']
        
        if 'dependency_overview' in fname:
            viz['dependency_overview'] = {
                'has_dependency_file': rec.get('has_dependency_file', False),
                'dependency_files': rec.get('dependency_files', []),
                'readme_env_ratio': rec.get('readme_env_ratio', 0),
                'readme_total_lines': rec.get('readme_total_lines', 0),
                'readme_env_lines': rec.get('readme_env_lines', 0)
            }
        elif 'dependency_staleness' in fname:
            viz['dependency_staleness'] = {
                'days_behind_repo': rec.get('max_staleness_vs_repo_days'),
                'days_behind_now': rec.get('max_staleness_vs_now_days')
            }
        elif 'import_vs_requirements' in fname:
            viz['import_vs_requirements'] = {
                'missing_ratio': rec.get('missing_ratio', 0),
                'redundant_ratio': rec.get('redundant_ratio', 0),
                'imports': rec.get('imports', [])
            }
        elif 'issue_env_stats' in fname:
            viz['issue_env_stats'] = {
                'env_issue_ratio': rec.get('env_issue_ratio', 0),
                'keyword_hits': rec.get('keyword_hits', {})
            }
        elif 'onboarding_stats' in fname:
            viz['onboarding_stats'] = {
                'contributing': rec.get('contributing', {}),
                'newcomer_issues': rec.get('newcomer_issues', {}),
                'newcomer_prs': rec.get('newcomer_prs', {})
            }
    
    return jsonify({'matches': matches, 'visualizations': viz})


if __name__ == '__main__':
    app.run(debug=True)
