"""Push local commits to GitHub via Git Data API.

本机 github.com:443 的 TLS 间歇被重置（直连与代理均失败），但 api.github.com 可用。
此脚本用官方 API 按序复刻远端缺失的提交链（blob/tree/commit/ref），
树与提交 SHA 与本地逐一校验一致。凭据取自 git credential fill，不落盘不回显。

用法：py tools/github-api-push.py   （在仓库任意目录运行，读 origin 远端与当前分支）
"""
import base64, json, re, ssl, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

def git(*args, binary=False):
    r = subprocess.run(['git', *args], capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode('utf-8')

def credential():
    r = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                       capture_output=True, text=True, check=True)
    d = dict(l.split('=', 1) for l in r.stdout.splitlines() if '=' in l)
    return d['username'], d['password']

USER, TOKEN = credential()

def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(5):
        req = urllib.request.Request('https://api.github.com' + path, method=method, data=data,
            headers={'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json',
                     'User-Agent': 'shigu-api-push', 'X-GitHub-Api-Version': '2022-11-28'})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                raw = r.read()
                return r.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            payload = e.read()
            try: parsed = json.loads(payload or b'{}')
            except ValueError: parsed = {'message': payload[:200].decode('utf-8', 'replace')}
            if e.code >= 500 and attempt < 4:
                wait = 3 * (attempt + 1)
                print(f'  HTTP {e.code}，{wait}s 后重试 ({attempt + 1}/4)...', flush=True)
                time.sleep(wait)
                continue
            return e.code, parsed
        except (urllib.error.URLError, ssl.SSLError, TimeoutError, ConnectionError, OSError) as e:
            if attempt == 4: raise
            wait = 3 * (attempt + 1)
            print(f'  网络抖动（{type(e).__name__}），{wait}s 后重试 ({attempt + 1}/4)...', flush=True)
            time.sleep(wait)

remote = git('remote', 'get-url', 'origin').strip()
m = re.search(r'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$', remote)
if not m: sys.exit('origin 不是 GitHub 仓库: ' + remote)
OWNER, REPO = m.group(1), m.group(2)
BRANCH = git('rev-parse', '--abbrev-ref', 'HEAD').strip()
HEAD = git('rev-parse', 'HEAD').strip()
print(f'repo {OWNER}/{REPO} branch {BRANCH} head {HEAD[:10]}')

s, ref = api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}')
remote_sha = ref['object']['sha'] if s == 200 else None
if remote_sha == HEAD:
    print('远端已是最新，无需同步')
    sys.exit(0)

bootstrapped = False
if remote_sha is None:
    s, info = api('GET', f'/repos/{OWNER}/{REPO}')
    if s == 200 and info.get('size', 0) == 0:
        content = git('show', 'HEAD:.gitignore', binary=True)
        s, b = api('PUT', f'/repos/{OWNER}/{REPO}/contents/.gitignore',
                   {'message': 'bootstrap', 'content': base64.b64encode(content).decode(), 'branch': BRANCH})
        if s not in (200, 201): sys.exit(f'空仓库引导失败: {s} {b.get("message")}')
        bootstrapped = True
        s, ref = api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}')
        remote_sha = ref['object']['sha'] if s == 200 else None
        print('空仓库已引导初始提交，稍后整体替换为本地提交树')

# 远端缺失的提交链（旧→新）；远端已有的分支提交（如队友 PR）天然可作父引用
if remote_sha:
    chain = git('rev-list', '--reverse', f'{remote_sha}..{HEAD}').split()
else:
    chain = git('rev-list', '--reverse', HEAD).split()
if not chain: sys.exit('本地 HEAD 不是远端分支的后继，请先 pull 合并（拒绝覆盖远端）')
print(f'待推送提交 {len(chain)} 个: ' + ', '.join(c[:10] for c in chain))

known_blobs = set()
if remote_sha:
    s, t = api('GET', f'/repos/{OWNER}/{REPO}/git/trees/{remote_sha}?recursive=1')
    if s == 200: known_blobs = {e['sha'] for e in t['tree'] if e['type'] == 'blob'}

def entries_of(sha):
    out = []
    # -z 输出原始字节路径：默认输出会把中文路径 C 转义加引号，直接上传会产生错误文件名
    for rec in git('ls-tree', '-r', '-z', sha, binary=True).split(b'\0'):
        if not rec: continue
        meta, path = rec.split(b'\t', 1)
        mode, typ, obj = meta.decode().split()
        out.append({'path': path.decode('utf-8'), 'mode': mode, 'type': 'blob', 'sha': obj})
    return out

def person(line):
    mm = re.match(r'^(author|committer) (.+) <(.*)> (\d+) ([+-]\d{4})$', line, re.M)
    ts, tz = int(mm.group(4)), mm.group(5)
    dt = datetime.fromtimestamp(ts, timezone(timedelta(hours=int(tz[:3]), minutes=int(tz[0] + tz[3:]))))
    return {'name': mm.group(2), 'email': mm.group(3), 'date': dt.isoformat()}

for sha in chain:
    entries = entries_of(sha)
    entry_set = {(e['path'], e['sha']) for e in entries}
    tree_sha = git('rev-parse', f'{sha}^{{tree}}').strip()
    # 树对象 SHA 与 git 一致且不被规范化：远端已有同 SHA 且条目一致的树则复用
    s, t = api('GET', f'/repos/{OWNER}/{REPO}/git/trees/{tree_sha}?recursive=1')
    if s == 200 and {(e['path'], e['sha']) for e in t['tree'] if e['type'] == 'blob'} == entry_set:
        print(f'  {sha[:10]} 树已存在，跳过上传')
    else:
        uploaded = 0
        for e in entries:
            if e['sha'] not in known_blobs:
                content = git('cat-file', 'blob', e['sha'], binary=True)
                s, b = api('POST', f'/repos/{OWNER}/{REPO}/git/blobs',
                           {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
                if s != 201: sys.exit(f'blob 上传失败 {e["path"]}: {s} {b.get("message")}')
                if b['sha'] != e['sha']: sys.exit(f'blob SHA 不一致 {e["path"]}')
                known_blobs.add(e['sha'])
                uploaded += 1
                if uploaded % 25 == 0: print(f'  uploaded {uploaded} blobs...', flush=True)
        s, tree = api('POST', f'/repos/{OWNER}/{REPO}/git/trees', {'tree': entries})
        if s != 201: sys.exit(f'tree 创建失败: {s} {tree.get("message")}')
        if tree['sha'] != tree_sha: sys.exit(f'tree SHA 不一致 {tree["sha"]} != {tree_sha}')
        print(f'  {sha[:10]} 上传 {uploaded} blobs，树已建')

    raw = git('cat-file', 'commit', sha)
    head_part, message = raw.split('\n\n', 1)
    author = person(re.search(r'^author .+$', head_part, re.M).group(0))
    committer = person(re.search(r'^committer .+$', head_part, re.M).group(0))
    parents = git('rev-list', '--parents', '-n', '1', sha).split()[1:]
    s, commit = api('POST', f'/repos/{OWNER}/{REPO}/git/commits',
                    {'message': message, 'tree': tree_sha, 'parents': parents,
                     'author': author, 'committer': committer})
    if s != 201: sys.exit(f'commit 创建失败 {sha[:10]}: {s} {commit.get("message")}')
    if commit['sha'] != sha:
        sys.exit(f'commit SHA 不一致（远端 {commit["sha"][:10]} ≠ 本地 {sha[:10]}），中止以免分叉')
    print(f'  commit {sha[:10]} OK')

new_sha = chain[-1]
if remote_sha:
    s, r = api('PATCH', f'/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}', {'sha': new_sha, 'force': bootstrapped})
    if s == 422 and 'fast forward' in str(r.get('message', '')) and bootstrapped:
        s, r = api('PATCH', f'/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}', {'sha': new_sha, 'force': True})
        print('远端为引导提交，已整体替换')
else:
    s, r = api('POST', f'/repos/{OWNER}/{REPO}/git/refs', {'ref': f'refs/heads/{BRANCH}', 'sha': new_sha})
if s not in (200, 201): sys.exit(f'ref 更新失败: {s} {r.get("message")}')

git('update-ref', f'refs/remotes/origin/{BRANCH}', new_sha)
git('branch', f'--set-upstream-to=origin/{BRANCH}', BRANCH)
print(f'完成：https://github.com/{OWNER}/{REPO}/tree/{BRANCH}  ({new_sha[:10]})')