/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { SourceMapManager } from "./SourceMapManager.js";
import type { DebugReproArguments } from "../types.js";

/**
 * Manager that captures name of all original sourcefiles touched by Prepack.
 * When Prepack exits (regardless of success or failure), the list of all
 * relevant sourcefiles is passed back to the CLI to be included in the reproBundle.
 */
export class DebugReproManagerImplementation {
  construct(configArgs: DebugReproArguments): DebugReproManagerImplementation {
    this._sourceMapManager = new SourceMapManager(configArgs.buckRoot, configArgs.sourcemaps);
    if (configArgs.sourcemaps) {
      this._sourceMapNames = [];
      configArgs.sourcemaps.forEach(m => {
        if (m.sourceMapFilename !== undefined) this._sourceMapNames.push(m.sourceMapFilename);
      });
    }
    this._usedSourceFiles = new Set();

    return this;
  }

  // Manager to translate between relative/absolute paths used by sourceMaps/Filesystem.
  _sourceMapManager: SourceMapManager;
  // Set of source files (to handle repeat additions) that Prepack encounters.
  _usedSourceFiles: Set<string>;
  // The actual sourcemaps associated with the input.
  _sourceMapNames: Array<string>;

  addSourceFile(fileName: string) {
    if (!fileName.includes("node_modules"))
      this._usedSourceFiles.add(this._sourceMapManager.relativeToAbsolute(fileName));
  }

  getSourceFilePaths(): Array<{ absolute: string, relative: string }> {
    return Array.from(this._usedSourceFiles).map(absolutePath => {
      return {
        absolute: absolutePath,
        relative: this._sourceMapManager.absoluteToRelative(absolutePath),
      };
    });
  }

  getSourceMapPaths(): Array<string> {
    return this._sourceMapNames;
  }
}
