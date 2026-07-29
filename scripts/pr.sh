#!/usr/bin/env bash
set -euo pipefail

base_branch="${1:-main}"
current_branch="$(git branch --show-current)"
repo_url="$(git remote get-url origin)"

if [[ -z "$current_branch" ]]; then
  echo "Could not determine the current branch."
  exit 1
fi

if [[ "$current_branch" == "$base_branch" ]]; then
  echo "You are on $base_branch. Create or switch to a feature branch first."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has uncommitted changes. Commit or stash them before opening a PR."
  exit 1
fi

git push -u origin "$current_branch"

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    gh pr create --base "$base_branch" --head "$current_branch" --fill
    exit 0
  fi
  echo "GitHub CLI is installed but not authenticated. Run: gh auth login"
fi

repo_path="$repo_url"
repo_path="${repo_path#https://github.com/}"
repo_path="${repo_path#git@github.com:}"
repo_path="${repo_path%.git}"

echo
echo "Open this URL to create the PR:"
echo "https://github.com/$repo_path/compare/$base_branch...$current_branch?expand=1"

