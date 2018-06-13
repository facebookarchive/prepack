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
  let fullPath = pathToInput.split("/");
  // Remove entires for leading/trailing slashes.
  if (fullPath[0] === "") fullPath.shift();
  if (fullPath[fullPath.length - 1] === "") fullPath.pop();
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
  let index = 0;
  let allPathsMatch = true;
  let maxIndex = Math.max(...paths.map(path => path.length));

  while (allPathsMatch && index < maxIndex) {
    let entry = paths[0][index]; // Arbitrary choice of 0th path, since we're checking if all entires match.
    for (let path of paths) {
      if (path[index] !== entry) {
        allPathsMatch = false;
        break;
      }
    }
    if (allPathsMatch) index += 1;
  }
  // Heuristic: if only one path, it will match itself, including the filename at the end.
  if (paths.length === 1) index -= 1;

  // Concatenate prefix into string that's bookended by slashes for use as an absolute path prefix.
  return `/${paths[0].slice(0, index).join("/")}/`;
}
