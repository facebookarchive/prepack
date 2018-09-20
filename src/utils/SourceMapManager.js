/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { SourceFile } from "../types.js";
import invariant from "../invariant.js";

/**
 * Sourcemap paths can come in one of two formats:
 *     - Relative: The paths include `../` and can be followed from the sourcemap's location
 *         to arrive at the original source's location. In this format, path conversion
 *         requires two different prefixes (MapDifference and CommonPrefix) that must be
 *         discovered from the input paths.
 *     - Common Directory: The paths take the format of an absolute path (`/foo/bar`) and
 *         assume there is a common prefix to the path that, when added, will make the path an
 *         valid absolute path. This prefix is passed in as the `buckRoot` argument.
 *     Example:
 *         In a directory structure with /A/B/map.js and /A/C/original.js,
 *         the sourcemaps would have the following path structures:
 *           - Relative: ../C/original.js, with `CP` = /A and 'MD' = ../
 *           - Common Directory: /C/original.js, with `buckRoot` = /A
 */
export class SourceMapManager {
  constructor(buckRoot?: string, sourceMaps?: Array<SourceFile>) {
    // Use presence of buck root argument to indicate which path format sourcemap prefixes take on.
    if (buckRoot !== undefined) {
      if (sourceMaps === undefined) {
        throw new Error("Invalid input: Can't provide a sourcemap directory root without having sourcemaps present");
      }
      this._buckRoot = buckRoot;
      if (this._buckRoot[this._buckRoot.length - 1] === "/") {
        // Remove trailing slash to prepare for prepending to internal paths.
        this._buckRoot = this._buckRoot.slice(0, -1);
      }
    } else {
      // If sourcemaps don't exist, set prefixes to undefined and break.
      if (sourceMaps && sourceMaps.length > 0) {
        for (let map of sourceMaps) {
          if (map.sourceMapContents === undefined || map.sourceMapContents === "") {
            this._sourcemapCommonPrefix = undefined;
            this._sourcemapMapDifference = undefined;
            return;
          }
        }
      } else {
        this._sourcemapCommonPrefix = undefined;
        this._sourcemapMapDifference = undefined;
        return;
      }

      // Extract common prefix and map difference
      let originalSourcePaths = [];
      let mapPaths = [];
      for (let map of sourceMaps) {
        invariant(map.sourceMapContents !== undefined); // Checked above.
        let parsed = JSON.parse(map.sourceMapContents);
        // Two formats for sourcemaps exist.
        if ("sections" in parsed) {
          for (let section of parsed.sections) {
            for (let source of section.map.sources) {
              originalSourcePaths.push(this._getAbsoluteSourcePath(map.filePath, source));
            }
          }
        } else {
          for (let source of parsed.sources) {
            originalSourcePaths.push(this._getAbsoluteSourcePath(map.filePath, source));
          }
        }
        mapPaths.push(this._stripEmptyStringBookends(map.filePath.split("/")));
      }

      let originalSourceCommonPrefix = this._findCommonPrefix(originalSourcePaths);
      let originalSourceCPElements = this._stripEmptyStringBookends(originalSourceCommonPrefix.split("/"));
      let mapCommonPrefix = this._findCommonPrefix(mapPaths);
      let mapCPElements = this._stripEmptyStringBookends(mapCommonPrefix.split("/"));

      this._sourcemapCommonPrefix = this._findCommonPrefix([originalSourceCPElements, mapCPElements]);
      this._sourcemapMapDifference = this._findMapDifference(this._sourcemapCommonPrefix, mapCommonPrefix);
    }
  }

  // Prefixes used to translate between relative paths stored in AST nodes and absolute paths given to IDE.
  _sourcemapCommonPrefix: void | string; // For paths relative to map location. (Used in Babel format)
  _sourcemapMapDifference: void | string; // For paths relative to map location. (Used in Babel format)
  _buckRoot: void | string; // For paths relative to directory root. (Used in Buck format)

  /**
   * Assumes that input file and sourcemap are in the same directory.
   * Assumes pathToInput is an absolute path and pathToSource is relative.
   * Uses pathToSource to find absolute path of original source file.
   */
  _getAbsoluteSourcePath(pathToInput: string, pathToSource: string): Array<string> {
    // pathToInput is an absolute path to the file being prepacked.
    let fullPath = this._stripEmptyStringBookends(pathToInput.split("/"));
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

  /**
   * Finds the longest possible prefix common to all input paths.
   * Input paths must be absolute.
   * Input is nested array because each path must be separated into elements.
   */
  _findCommonPrefix(paths: Array<Array<string>>): string {
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

  /**
   * Finds the path that must be followed to arrive at the directory of the
   * common prefix from the sourcemap.
   */
  _findMapDifference(commonPrefix: string, mapPrefix: string): string {
    // Find difference in path between the map's location and the common prefix.
    let mapPrefixUniqueElements = this._stripEmptyStringBookends(mapPrefix.replace(commonPrefix, "").split("/"));
    let mapDifference = "";
    for (let i = 0; i < mapPrefixUniqueElements.length; i++) {
      mapDifference = mapDifference.concat("../");
    }
    return mapDifference;
  }

  /**
   *  Takes in ["", "foo", "bar", ""] and returns ["foo", "bar"]
   */
  _stripEmptyStringBookends(path: Array<string>): Array<string> {
    if (path[0] === "") path.shift();
    if (path[path.length - 1] === "") path.pop();
    return path;
  }

  /**
   * Used by DebugAdapter to convert relative paths (used internally in debugging/Prepack engine)
   * into absolute paths (used by debugging UI/IDE).
   */
  relativeToAbsolute(path: string): string {
    let absolute;
    if (this._buckRoot !== undefined) {
      let dirRoot = this._buckRoot;
      if (
        // If the "relative" path is actually absolute, then don't prepend anything.
        this._stripEmptyStringBookends(path.split("/"))[0] ===
        this._stripEmptyStringBookends(this._buckRoot.split("/"))[0]
      ) {
        absolute = path;
      } else {
        let separator = path[0] === "/" ? "" : "/";
        absolute = dirRoot + separator + path;
      }
    } else {
      if (this._sourcemapCommonPrefix !== undefined && this._sourcemapMapDifference !== undefined) {
        absolute = path.replace(this._sourcemapMapDifference, "");
        invariant(this._sourcemapCommonPrefix !== undefined);
        absolute = this._sourcemapCommonPrefix + absolute;
      } else {
        absolute = path;
      }
    }
    return absolute;
  }

  /**
   * Used by DebugAdapter to convert absolute paths (used by debugging UI/IDE)
   * into relative paths (used internally in debugging/Prepack engine).
   */
  absoluteToRelative(path: string): string {
    let relative;
    if (this._buckRoot !== undefined) {
      relative = path.replace(this._buckRoot, "");
    } else {
      if (this._sourcemapCommonPrefix !== undefined && this._sourcemapMapDifference !== undefined) {
        relative = path.replace(this._sourcemapCommonPrefix, "");
        invariant(this._sourcemapMapDifference !== undefined);
        relative = this._sourcemapMapDifference + relative;
      } else {
        relative = path;
      }
    }
    return relative;
  }
}
