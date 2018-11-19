#!/bin/bash

set -e

# Configurations
ORIGIN_URI=$(git config remote.origin.url)

SRC_BRANCH="master"
SRC_DIR="website"
DEST_BRANCH="gh-pages"
DEST_DIR="."

TMP_DIR="$PWD/tmp_website_build" # careful, the script will rm -rf this directory
                                 # make sure it's an absolute path
SRC_CLONE_DIR="$TMP_DIR/master"
DEST_CLONE_DIR="$TMP_DIR/gh-pages"

SCRIPT_NAME=`basename "$0"`
COMMIT_MESSAGE="Website published using $SCRIPT_NAME"

BUILD_COMMAND="yarn install && yarn build && mv prepack.min.js $SRC_DIR/js/"

# Utils
RED='\033[0;31m'
GREEN='\033[0;32m'
NO_COLOR='\033[0m'
print_green() { echo -e "${GREEN}$1${NO_COLOR}"; }
print_red() { echo -e "${RED}$1${NO_COLOR}"; }
print_ok() { print_green "[ OK ]\n"; }
print_error() { print_red "[ ERROR ]\n"; }
pushd_quiet() { pushd $1 > /dev/null; }
popd_quiet() { popd $1 > /dev/null; }
remove_tmp_dir() {
  if [ -d $TMP_DIR ]; then
    rm -rf $TMP_DIR
  fi
}

echo ---------------------------------------------------------------------------
echo "This script will erase the content of the destination branch and replace \
it with the content of the source branch."
echo ---------------------------------------------------------------------------
echo "Origin URI: $ORIGIN_URI"
echo "Source branch: $SRC_BRANCH"
echo "Source directory: $SRC_DIR"
echo "Destination branch: $DEST_BRANCH"
echo "Destination directory: $DEST_DIR"
echo "Build command: $BUILD_COMMAND (will be run in source branch before" \
     "moving its content)"
echo ---------------------------------------------------------------------------

read -p "Proceed? [y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  print_error
  echo "Operation aborted by user"
  exit 1
fi

# Clean build directory to fetch a fresh copy of the branches everytime the
# script is run. Stateless scripts are easier to debug.
remove_tmp_dir

print_green "Cloning source branch from remote..."
git clone --single-branch -b $SRC_BRANCH $ORIGIN_URI $SRC_CLONE_DIR
print_ok

print_green "Cloning destination branch from remote..."
git clone --single-branch -b $DEST_BRANCH $ORIGIN_URI $DEST_CLONE_DIR
print_ok

print_green "Running build command on source branch..."
pushd_quiet $SRC_CLONE_DIR
eval $BUILD_COMMAND
popd_quiet
print_ok

print_green "Cleaning destination branch..."
pushd_quiet $DEST_CLONE_DIR/$DEST_DIR
git rm -r *
popd_quiet
print_ok

print_green "Copying from source branch/directory to destination branch/directory..."
cp -a $SRC_CLONE_DIR/$SRC_DIR/* $DEST_CLONE_DIR/$DEST_DIR
print_ok

print_green "Creating commit..."
pushd_quiet $DEST_CLONE_DIR
git add $DEST_DIR
git commit -m "$COMMIT_MESSAGE" || (
  print_error &&
  echo "=> git-commit returned non zero code."
  echo "=> This could be because source branch/directory and destination" \
       "branch/directory already have identical content." &&
  echo "=> Make sure you pushed your changes to $ORIGIN_URI and run this script" \
       "again" &&
  exit 1
)
popd_quiet
print_ok

read -p "Push changes to origin/$DEST_BRANCH? [y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  print_green "Pushing changes to origin/$DEST_BRANCH..."
  pushd_quiet $DEST_CLONE_DIR
  git push
  popd_quiet
  print_ok
else
  echo "Operation aborted. Changes have not been pushed to origin/$DEST_BRANCH."
  print_error
fi

print_green "Cleanup! Removing temporary files..."
remove_tmp_dir
print_ok
