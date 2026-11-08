#!/bin/bash
# Prints the version the deploy releases: the last vX.Y.Z tag bumped by the conventional commits since it. A breaking
# change (type! or BREAKING CHANGE:) bumps the major version, a feat the minor, anything else the patch; every deploy
# gets a version. The first one is v0.1.0. Prints nothing when HEAD already carries a version (a re-run deploy).
set -euo pipefail

pattern='v[0-9]*.[0-9]*.[0-9]*'

if git describe --exact-match --tags --match "$pattern" HEAD >/dev/null 2>&1; then
  exit 0
fi

last=$(git describe --tags --abbrev=0 --match "$pattern" 2>/dev/null || true)
if [[ -z $last ]]; then
  echo v0.1.0
  exit 0
fi

IFS=. read -r major minor patch <<<"${last#v}"
commits=$(git log --format='%s%n%b' "$last..HEAD")

if grep -qE '^[a-z]+(\([^)]*\))?!:|^BREAKING CHANGE:' <<<"$commits"; then
  echo "v$((major + 1)).0.0"
elif grep -qE '^feat(\([^)]*\))?:' <<<"$commits"; then
  echo "v$major.$((minor + 1)).0"
else
  echo "v$major.$minor.$((patch + 1))"
fi
