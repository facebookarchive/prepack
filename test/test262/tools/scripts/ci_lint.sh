#!/bin/bash

if [ "$TRAVIS_PULL_REQUEST" != "false" ]; then
  paths=$(git diff --diff-filter ACMR --name-only $TRAVIS_BRANCH -- test/)

  if [ "$paths" == "" ]; then
    echo No test files added or modified. Exiting.
    exit 0
  fi

  echo New or modified test files:
  echo "$paths"

else
  paths="test/"
fi

./tools/lint/lint.py --whitelist lint.whitelist $paths
