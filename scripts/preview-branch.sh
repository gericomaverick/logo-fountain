#!/usr/bin/env bash
# Look at what an agent has done on a branch, and put it in front of you running.
#
#   scripts/preview-branch.sh                     the usual branch, show and load
#   scripts/preview-branch.sh some/other-branch   another one
#   scripts/preview-branch.sh --diff              show what is new, change nothing
#   scripts/preview-branch.sh --fast              load it without running the checks
#
# It never touches your own checkout: the branch is loaded detached in the
# preview worktree, and the app is restarted there. The database, your session
# and any brief draft are untouched.
set -euo pipefail

BRANCH="${PREVIEW_BRANCH:-workbench/premium-brief-prototype}"
PREVIEW="${PREVIEW_WORKTREE:-$HOME/.openclaw/workspace/projects/logo-fountain-test}"
PORT=45231
PGBIN="${POSTGRES_TEST_BIN:-/usr/lib/postgresql/18/bin}"
PGSHARE="${POSTGRES_TEST_SHARE:-/usr/share/postgresql/18}"

DIFF_ONLY=no
RUN_CHECKS=yes
for arg in "$@"; do
	case "$arg" in
		--diff) DIFF_ONLY=yes ;;
		--fast) RUN_CHECKS=no ;;
		-*) echo "Unknown option: $arg" >&2; exit 2 ;;
		*) BRANCH="$arg" ;;
	esac
done

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO"

git fetch --all --quiet 2>/dev/null || true

if ! git rev-parse --verify --quiet "$BRANCH" >/dev/null; then
	echo "No such branch: $BRANCH" >&2
	echo "Branches an agent has worked on lately:" >&2
	git for-each-ref --sort=-committerdate --format='  %(committerdate:short)  %(refname:short)' refs/heads | head -8 >&2
	exit 1
fi

TIP="$(git rev-parse --short "$BRANCH")"
LOADED="$(git -C "$PREVIEW" rev-parse --short HEAD 2>/dev/null || echo none)"

echo "branch:  $BRANCH"
echo "tip:     $TIP  $(git log -1 --format=%s "$BRANCH")"
echo "loaded:  $LOADED"
echo

if [ "$LOADED" = "$TIP" ]; then
	echo "Already loaded — nothing new since you last looked."
else
	echo "── new since the running copy ──"
	git log --oneline "$LOADED..$BRANCH" 2>/dev/null || git log --oneline -5 "$BRANCH"
	echo
	echo "── files changed ──"
	git diff --stat "$LOADED..$BRANCH" 2>/dev/null || true
	echo
fi

# How far it has drifted from what you have on main.
BASE="$(git merge-base main "$BRANCH")"
echo "── against main ──"
echo "based on $(git rev-parse --short "$BASE")  $(git log -1 --format=%s "$BASE")"
echo "behind main by $(git rev-list --count "$BRANCH..main") commit(s)"
git diff --stat "main...$BRANCH" | tail -1
echo

if [ "$DIFF_ONLY" = yes ]; then
	echo "Read the whole change with:"
	echo "  git diff main...$BRANCH"
	exit 0
fi

if [ "$LOADED" = "$TIP" ]; then
	echo "Leaving the app as it is. Force a reload with: $0 $BRANCH --fast"
	exit 0
fi

echo "── stopping the app ──"
pkill -TERM -f "local-dev-pg.mjs app" 2>/dev/null || true
sleep 2
NEXT_PID="$(pgrep -f "next dev --webpack --hostname 127.0.0.1 --port $PORT" | head -1 || true)"
if [ -n "$NEXT_PID" ]; then
	kill -TERM "-$NEXT_PID" 2>/dev/null || kill -TERM "$NEXT_PID" 2>/dev/null || true
	sleep 2
fi

echo "── loading $TIP ──"
git -C "$PREVIEW" checkout --detach "$BRANCH" --quiet
git -C "$PREVIEW" log --oneline -1

if [ "$RUN_CHECKS" = yes ]; then
	echo
	echo "── checks ──"
	cd "$PREVIEW/apps/web"
	if ! npm run typecheck >/tmp/preview-typecheck.log 2>&1; then
		echo "typecheck FAILED — see /tmp/preview-typecheck.log"; tail -12 /tmp/preview-typecheck.log; exit 1
	fi
	echo "typecheck ok"
	if ! npm run lint >/tmp/preview-lint.log 2>&1; then
		echo "lint FAILED — see /tmp/preview-lint.log"; tail -12 /tmp/preview-lint.log; exit 1
	fi
	echo "lint ok"
	if ! npm run test >/tmp/preview-test.log 2>&1; then
		echo "tests FAILED — see /tmp/preview-test.log"; grep -E "×|FAIL" /tmp/preview-test.log | head -10; exit 1
	fi
	grep -E "Tests  " /tmp/preview-test.log || echo "tests ok"
	cd "$REPO"
fi

echo
echo "── starting the app ──"
cd "$PREVIEW/apps/web"
POSTGRES_TEST_BIN="$PGBIN" POSTGRES_TEST_SHARE="$PGSHARE" \
	nohup node scripts/local-dev-pg.mjs app >/tmp/preview-app.log 2>&1 &

for _ in $(seq 1 40); do
	if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "http://127.0.0.1:$PORT/login" 2>/dev/null)" = "200" ]; then
		echo "ready: http://127.0.0.1:$PORT"
		exit 0
	fi
	sleep 3
done

echo "The app did not answer on $PORT. Its output is in /tmp/preview-app.log" >&2
exit 1
