/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

/**
 * Assumes that input file and sourcemap are in the same directory.
 * Assumes pathToInput is an absolute path and pathToSource is relative.
 * Uses pathToSource to find absolute path of original source file.
 */
export function getAbsoluteSourcePath(pathToInput: string, pathToSource: string): Array<string> {
  // pathToInput is an absolute path to the file being prepacked.
  let fullPath = stripEmptyStringBookends(pathToInput.split("/"));
  // Remove last entry because it is the filename, while we want the parent directory of the input file.
  fullPath.pop();

  // Traverse the path to the source file.
  let steps = pathToSource.split("/");
  for (let step of steps) {
    switch (step) {
      case ".":
        break;
      case "..":
        fullPath.pop();
        break;
      default:
        fullPath.push(step);
        break;
    }
  }
  return fullPath;
}

export function findCommonPrefix(paths: Array<Array<string>>): string {
  // Find the point at which the paths diverge.
  let divergenceIndex = 0;
  let allPathsMatch = true;
  let maxDivergenceIndex = Math.max(...paths.map(path => path.length));

  while (allPathsMatch && divergenceIndex < maxDivergenceIndex) {
    let entry = paths[0][divergenceIndex]; // Arbitrary choice of 0th path, since we're checking if all entires match.
    for (let path of paths) {
      if (path[divergenceIndex] !== entry) {
        allPathsMatch = false;
        break;
      }
    }
    if (allPathsMatch) divergenceIndex += 1;
  }
  // Edge case: if there's only one path, it will match itself, including the filename at the end.
  // For 2+ paths, even if they all share a prefix, the filenames will not match, so this is not needed.
  if (paths.length === 1) divergenceIndex -= 1;

  // Concatenate prefix into string that's bookended by slashes for use as an absolute path prefix.
  return `/${paths[0].slice(0, divergenceIndex).join("/")}/`;
}

export function findMapDifference(commonPrefix: string, mapPrefix: string): string {
  // Find difference in path between the map's location and the common prefix.
  let mapPrefixUniqueElements = stripEmptyStringBookends(mapPrefix.replace(commonPrefix, "").split("/"));
  let mapDifference = "";
  for (let i = 0; i < mapPrefixUniqueElements.length; i++) {
    mapDifference = mapDifference.concat("../");
  }
  return mapDifference;
}

/**
 *  Takes in ["", "foo", "bar", ""] and returns ["foo", "bar"]
 */
export function stripEmptyStringBookends(path: Array<string>): Array<string> {
  if (path[0] === "") path.shift();
  if (path[path.length - 1] === "") path.pop();
  return path;
}
