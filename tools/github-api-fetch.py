"""Fetch a GitHub branch via Git Data API when github.com:443 TLS is reset.

api.github.com 可达而 git 协议被重置时，用官方 API 读回 commit/tree/blob，
在本地按原始字节重建 git 对象（SHA 逐一校验），等效 git fetch。
凭据取自 git credential fill，不落盘不回显。

用法：py tools/github-api-fetch.py <远端分支名>
"""
import base64, json, re, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime

def git(*args, binary=False):
    r = subprocess.run(['git', *args], capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode('utf-8')

def has(sha):
    return subprocess.run(['git', 'cat-file', '-e', sha], capture_output=True).returncode == 0

def credential():
    r = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                       capture_output=True, text=True, check=True)
    d = dict(l.split('=', 1) for l in r.stdout.splitlines() if '=' in l)
    return d['password']

TOKEN = credential()

def api(path):
    for a in range(6):
        req = urllib.request.Request('https://api.github.com' + path,
            headers={'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'shigu-api-fetch',
                     'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f'API {e.code} {path}: {e.read()[:200].decode("utf-8", "replace")}')
        except Exception as e:
            if a == 5: raise
            print(f'  网络抖动（{type(e).__name__}），{3*(a+1)}s 后重试...', flush=True)
            time.sleep(3 * (a + 1))

remote = git('remote', 'get-url', 'origin').strip()
m = re.search(r'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$', remote)
if not m: sys.exit('origin 不是 GitHub 仓库: ' + remote)
OWNER, REPO = m.group(1), m.group(2)
BRANCH = sys.argv[1] if len(sys.argv) > 1 else 'main'

b = api(f'/repos/{OWNER}/{REPO}/branches/{BRANCH}')
target = b['commit']['sha']
print(f'branch {BRANCH} head {target[:10]}')

def ensure_blob(sha):
    if has(sha): return
    blob = api(f'/repos/{OWNER}/{REPO}/git/blobs/{sha}')
    content = base64.b64decode(blob['content'])
    r = subprocess.run(['git', 'hash-object', '-w', '--stdin'], input=content, capture_output=True, check=True)
    if r.stdout.decode().strip() != sha: sys.exit(f'blob SHA 不一致 {sha}')

def ensure_tree(sha):
    if has(sha): return
    t = api(f'/repos/{OWNER}/{REPO}/git/trees/{sha}?recursive=1')
    if t.get('truncated'): sys.exit('树过大被截断，需分批处理')
    dirs = {}
    for e in t['tree']:
        parts = e['path'].split('/')
        d = '/'.join(parts[:-1])
        dirs.setdefault(d, []).append((parts[-1], e))
    for e in t['tree']:
        if e['type'] == 'blob': ensure_blob(e['sha'])
    # 深层目录先写，父目录引用子树 SHA
    for d in sorted(dirs, key=lambda p: p.count('/'), reverse=True):
        lines = []
        for name, e in dirs[d]:
            if e['type'] == 'blob':
                lines.append(f'{e["mode"]} blob {e["sha"]}\t{name}')
            else:
                ensure_tree(e['sha'])
                lines.append(f'040000 tree {e["sha"]}\t{name}')
        r = subprocess.run(['git', 'mktree'], input=('\n'.join(lines) + '\n').encode('utf-8'),
                           capture_output=True, check=True)
        made = r.stdout.decode().strip()
        if d == '':
            if made != sha: sys.exit(f'根树 SHA 不一致 {made} != {sha}')
        else:
            expect = next(e['sha'] for e in t['tree'] if e['path'] == d and e['type'] == 'tree')
            if made != expect: sys.exit(f'子树 SHA 不一致 {d}')

def raw_person(kind, p, tz):
    dt = datetime.fromisoformat(p['date'].replace('Z', '+00:00'))
    return f'{kind} {p["name"]} <{p["email"]}> {int(dt.timestamp())} {tz}'

# API 把日期规范化为 UTC，原始提交的时区偏移丢失：按常见时区→全时区扫描还原
TZ_CANDIDATES = ['+0800', '+0000', '+0900', '+0100', '+0200', '+0300', '+0530', '+1000', '-0500', '-0800', '-0300', '-0000']
TZ_CANDIDATES += [f'{"+" if h >= 0 else "-"}{abs(h):02d}{m:02d}'
                  for h in range(-12, 15) for m in (0, 30, 45)
                  if f'{"+" if h >= 0 else "-"}{abs(h):02d}{m:02d}' not in TZ_CANDIDATES]

def ensure_commit(sha):
    if has(sha): return
    c = api(f'/repos/{OWNER}/{REPO}/git/commits/{sha}')
    ensure_tree(c['tree']['sha'])
    for p in c['parents']: ensure_commit(p['sha'])
    matched = None
    for tz in TZ_CANDIDATES:
        lines = [f'tree {c["tree"]["sha"]}'] + [f'parent {p["sha"]}' for p in c['parents']]
        lines += [raw_person('author', c['author'], tz), raw_person('committer', c['committer'], tz)]
        head = '\n'.join(lines) + '\n\n'
        for msg in (c['message'], c['message'].rstrip('\n'), c['message'] + '\n'):
            raw = (head + msg).encode('utf-8')
            r = subprocess.run(['git', 'hash-object', '-t', 'commit', '--stdin'], input=raw, capture_output=True, check=True)
            if r.stdout.decode().strip() == sha:
                matched = raw
                break
        if matched: break
    if matched is None: sys.exit(f'无法重建提交对象 {sha}（字段与远端不一致）')
    subprocess.run(['git', 'hash-object', '-t', 'commit', '-w', '--stdin'], input=matched, check=True)
    print(f'  rebuilt commit {sha[:10]}: {c["message"].splitlines()[0]}', flush=True)

ensure_commit(target)
git('update-ref', f'refs/remotes/origin/{BRANCH}', target)
print(f'完成：origin/{BRANCH} -> {target[:10]}（对象 SHA 全部与远端一致）')