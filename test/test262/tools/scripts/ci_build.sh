#!/bin/sh
if [ $TRAVIS_PULL_REQUEST != "false" ]; then
  ./make.py clean
fi
./make.py
if [ -n "$(git status --porcelain)" -a $TRAVIS_PULL_REQUEST != "false" ]; then
  echo New changes were found after re-generating the tests.
  echo Please, read the documentation on procedurally generated tests
  echo 'https://github.com/tc39/test262/blob/master/CONTRIBUTING.md#procedurally-generated-tests'
  exit 1
fi
