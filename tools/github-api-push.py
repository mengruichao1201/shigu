"""Push local HEAD to GitHub via Git Data API.

本机 github.com:443 的 TLS 被重置（直连与代理均失败），但 api.github.com 可用。
此脚本用官方 API 复刻本地提交（blob/tree/commit/ref），提交 SHA 与本地一致，
之后开 Clash 等代理即可正常 git push。凭据取自 git credential fill，不落盘不回显。

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
                return r.status, json.loads(r.read())
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
        content = git('show', f'HEAD:.gitignore', binary=True)
        s, b = api('PUT', f'/repos/{OWNER}/{REPO}/contents/.gitignore',
                   {'message': 'bootstrap', 'content': base64.b64encode(content).decode(), 'branch': BRANCH})
        if s not in (200, 201): sys.exit(f'空仓库引导失败: {s} {b.get("message")}')
        bootstrapped = True
        s, ref = api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}')
        remote_sha = ref['object']['sha'] if s == 200 else None
        print('空仓库已引导初始提交，稍后整体替换为本地提交树')

local_tree = git('rev-parse', 'HEAD^{tree}').strip()
local_entries = []
# -z 输出原始字节路径：默认输出会把中文路径 C 转义并加引号，直接上传会产生错误文件名
for rec in git('ls-tree', '-r', '-z', HEAD, binary=True).split(b'\0'):
    if not rec: continue
    meta, path = rec.split(b'\t', 1)
    mode, typ, sha = meta.decode().split()
    local_entries.append({'path': path.decode('utf-8'), 'mode': mode, 'type': 'blob', 'sha': sha})
local_blob_shas = {e['sha'] for e in local_entries}
local_entry_set = {(e['path'], e['sha']) for e in local_entries}

# 树对象 SHA 与 git 一致且不被规范化：若远端已有同 SHA 且条目完全一致的树，直接复用
tree_sha = None
s, t = api('GET', f'/repos/{OWNER}/{REPO}/git/trees/{local_tree}?recursive=1')
if s == 200 and {(e['path'], e['sha']) for e in t['tree'] if e['type'] == 'blob'} == local_entry_set:
    tree_sha = local_tree
    print('远端对象库已存在完整提交树，跳过 blob 上传')

if tree_sha is None:
    remote_blobs = set()
    if remote_sha:
        s, t = api('GET', f'/repos/{OWNER}/{REPO}/git/trees/{remote_sha}?recursive=1')
        if s == 200: remote_blobs = {e['sha'] for e in t['tree'] if e['type'] == 'blob'}
    # blob 按内容寻址：远端已含全部内容（哪怕路径有误）时无需重传，只需重建正确的树
    skip_upload = local_blob_shas <= remote_blobs
    uploaded = 0
    for e in local_entries:
        if not skip_upload and e['sha'] not in remote_blobs:
            content = git('cat-file', 'blob', e['sha'], binary=True)
            s, b = api('POST', f'/repos/{OWNER}/{REPO}/git/blobs',
                       {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
            if s != 201: sys.exit(f'blob 上传失败 {e["path"]}: {s} {b.get("message")}')
            if b['sha'] != e['sha']: sys.exit(f'blob SHA 不一致 {e["path"]}')
            uploaded += 1
            if uploaded % 25 == 0: print(f'  uploaded {uploaded} blobs...', flush=True)
    print(f'blobs: {len(local_entries)} total, {uploaded} uploaded'
          + ('（远端已有全部内容，仅重建树）' if skip_upload else ''), flush=True)
    s, tree = api('POST', f'/repos/{OWNER}/{REPO}/git/trees', {'tree': local_entries})
    if s != 201: sys.exit(f'tree 创建失败: {s} {tree.get("message")}')
    tree_sha = tree['sha']

raw = git('cat-file', 'commit', HEAD)
head_part, message = raw.split('\n\n', 1)
def person(line):
    mm = re.match(r'^(author|committer) (.+) <(.*)> (\d+) ([+-]\d{4})$', line, re.M)
    if not mm: return None
    ts, tz = int(mm.group(4)), mm.group(5)
    dt = datetime.fromtimestamp(ts, timezone(timedelta(hours=int(tz[:3]), minutes=int(tz[0] + tz[3:]))))
    return {'name': mm.group(2), 'email': mm.group(3), 'date': dt.isoformat()}
author = person(re.search(r'^author .+$', head_part, re.M).group(0))
committer = person(re.search(r'^committer .+$', head_part, re.M).group(0))
parents = git('rev-list', '--parents', '-n', '1', HEAD).split()[1:]
s, commit = api('POST', f'/repos/{OWNER}/{REPO}/git/commits',
                {'message': message, 'tree': tree_sha, 'parents': parents,
                 'author': author, 'committer': committer})
if s != 201: sys.exit(f'commit 创建失败: {s} {commit.get("message")}')
new_sha = commit['sha']
if new_sha != HEAD:
    print(f'GitHub 规范化了提交对象（远端 {new_sha[:10]} ≠ 本地 {HEAD[:10]}），以远端为准对齐本地')

if remote_sha:
    s, r = api('PATCH', f'/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}', {'sha': new_sha, 'force': bootstrapped})
    if s == 422 and 'fast forward' in str(r.get('message', '')):
        # 远端只有我们自己的引导/同内容提交时才允许强替，避免覆盖他人工作
        sc, rc = api('GET', f'/repos/{OWNER}/{REPO}/git/commits/{remote_sha}')
        ok = False
        if sc == 200:
            if rc.get('message', '').strip() == 'bootstrap' or rc['tree']['sha'] == tree_sha:
                ok = True
            else:
                st, rt = api('GET', f'/repos/{OWNER}/{REPO}/git/trees/{remote_sha}?recursive=1')
                if st == 200 and {e['sha'] for e in rt['tree'] if e['type'] == 'blob'} == local_blob_shas:
                    ok = True  # 本人上次上传的同内容提交（如路径转义有误），整体修正
        if ok:
            s, r = api('PATCH', f'/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}', {'sha': new_sha, 'force': True})
            print('远端为引导/同内容提交，已整体替换为本地提交树')
        else:
            sys.exit('远端存在他人提交，拒绝强推；请先 git pull 合并')
else:
    s, r = api('POST', f'/repos/{OWNER}/{REPO}/git/refs', {'ref': f'refs/heads/{BRANCH}', 'sha': new_sha})
if s not in (200, 201): sys.exit(f'ref 更新失败: {s} {r.get("message")}')

if new_sha != HEAD:
    s, c = api('GET', f'/repos/{OWNER}/{REPO}/git/commits/{new_sha}')
    if s != 200: sys.exit(f'读回远端提交失败: {s}')
    def raw_person(kind):
        p = c[kind]
        dt = datetime.fromisoformat(p['date'].replace('Z', '+00:00'))
        off = dt.utcoffset()
        mins = int(off.total_seconds() // 60)
        tz = f'{"+" if mins >= 0 else "-"}{abs(mins)//60:02d}{abs(mins)%60:02d}'
        return f'{kind} {p["name"]} <{p["email"]}> {int(dt.timestamp())} {tz}'
    lines = [f'tree {c["tree"]["sha"]}'] + [f'parent {p["sha"]}' for p in c['parents']]
    lines += [raw_person('author'), raw_person('committer')]
    head_blob = '\n'.join(lines) + '\n\n'
    matched = None
    for msg in (c['message'], c['message'].rstrip('\n'), c['message'] + '\n'):
        raw = (head_blob + msg).encode('utf-8')
        r = subprocess.run(['git', 'hash-object', '-t', 'commit', '--stdin'], input=raw, capture_output=True, check=True)
        if r.stdout.decode().strip() == new_sha:
            matched = raw
            break
    if matched is None: sys.exit('无法按远端字段重建提交对象，请手动核对')
    subprocess.run(['git', 'hash-object', '-t', 'commit', '-w', '--stdin'], input=matched, check=True)
    git('update-ref', f'refs/heads/{BRANCH}', new_sha)
    print('本地 HEAD 已对齐远端提交（工作区内容不变）')

git('update-ref', f'refs/remotes/origin/{BRANCH}', new_sha)
git('branch', f'--set-upstream-to=origin/{BRANCH}', BRANCH)
print(f'完成：https://github.com/{OWNER}/{REPO}/tree/{BRANCH}  ({new_sha[:10]})')