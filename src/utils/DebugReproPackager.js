/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow-strict */

/* eslint-disable no-shadow */

import zipFactory from "node-zip";
import zipdir from "zip-dir";
import path from "path";
import child_process from "child_process";
import fs from "fs";

export class DebugReproPackager {
  constructor() {
    this._reproZip = zipFactory();
    return;
  }

  _reproZip: zipFactory;

  _generateZip(
    reproArguments: Array<string>,
    reproFileNames: Array<string>,
    reproFilePath: string,
    runtimeDir: string
  ): void {
    // Programatically assemble parameters to debugger.
    let reproScriptArguments = `prepackArguments=${reproArguments.map(a => `${a}`).join("&prepackArguments=")}`;
    let reproScriptSourceFiles = `sourceFiles=$(pwd)/${reproFileNames
      .map(f => `${path.basename(f)}`)
      .join("&sourceFiles=$(pwd)/")}`;

    // Generating script that `yarn install`s prepack dependencies.
    // Then assembles a Nuclide deeplink that reflects the copy of Prepack in the package,
    // the prepack arguments that this run was started with, and the input files being prepacked.
    // The link is then called to open the Nuclide debugger.
    this._reproZip.file(
      "repro.sh",
      `#!/bin/bash
      unzip prepack-runtime-bundle.zip
      yarn install
      PREPACK_RUNTIME="prepackRuntime=$(pwd)/${runtimeDir}/prepack-cli.js"
      PREPACK_ARGUMENTS="${reproScriptArguments}"
      PREPACK_SOURCEFILES="${reproScriptSourceFiles}"
      atom \"atom://nuclide/prepack-debugger?$PREPACK_SOURCEFILES&$PREPACK_RUNTIME&$PREPACK_ARGUMENTS\"
      `
    );
    const data = this._reproZip.generate({ base64: false, compression: "DEFLATE" });
    if (reproFilePath) {
      fs.writeFileSync(reproFilePath, data, "binary");
      console.log(`ReproBundle written to ${reproFilePath}`);
    }
  }

  // Returns true on success, false on failure
  generateDebugRepro(
    shouldExitWithError: boolean,
    sourceFiles: Array<{ absolute: string, relative: string }>,
    sourceMaps: Array<string>,
    reproFilePath: string,
    reproFileNames: Array<string>,
    reproArguments: Array<string>,
    externalPrepackPath?: string
  ): void {
    if (reproFilePath === undefined) process.exit(1);

    // Copy all input files.
    for (let file of reproFileNames) {
      try {
        let content = fs.readFileSync(file, "utf8");
        this._reproZip.file(path.basename(file), content);
      } catch (err) {
        console.error(`Could not zip input file ${err}`);
        if (shouldExitWithError) process.exit(1);
        else return;
      }
    }

    // Copy all sourcemaps (discovered while prepacking).
    for (let map of sourceMaps) {
      try {
        let content = fs.readFileSync(map, "utf8");
        this._reproZip.file(path.basename(map), content);
      } catch (err) {
        console.error(`Could not zip sourcemap: ${err}`);
        if (shouldExitWithError) process.exit(1);
        else return;
      }
    }

    // Copy all original sourcefiles used while Prepacking.
    for (let file of sourceFiles) {
      try {
        // To avoid copying the "/User/name/..." version of the bundle/map/model included in originalSourceFiles
        if (!reproFileNames.includes(file.relative)) {
          let content = fs.readFileSync(file.absolute, "utf8");
          this._reproZip.file(file.relative, content);
        }
      } catch (err) {
        console.error(`Could not zip source file: ${err}. Proceeding...`);
      }
    }

    // If not told where to copy prepack from, try to yarn pack it up.
    if (externalPrepackPath === undefined) {
      // Copy Prepack lib and package.json to install dependencies.
      // The `yarn pack` command finds all necessary files automatically.
      // The following steps need to be sequential, hence the series of `.on("exit")` callbacks.
      let yarnRuntime = "yarn";
      let yarnCommand = ["pack", "--filename", path.resolve(process.cwd(), "prepack-bundled.tgz")];
      child_process.spawnSync(yarnRuntime, yarnCommand, { cwd: __dirname });
      // Because zipping the .tgz causes corruption issues when unzipping, we will
      // unpack the .tgz, then zip those contents.
      let unzipRuntime = "tar";
      let unzipCommand = ["-xzf", path.resolve(`.`, "prepack-bundled.tgz")];
      child_process.spawnSync(unzipRuntime, unzipCommand);
      // Note that this process is asynchronous. A process.exit() elsewhere in this cli code
      // might cause the whole process (including an ongoing zip) to prematurely terminate.
      zipdir(path.resolve(".", "package"), (err, buffer) => {
        if (err) {
          console.error(`Could not zip Prepack ${err}`);
          process.exit(1);
        }

        this._reproZip.file("prepack-runtime-bundle.zip", buffer);
        this._generateZip(reproArguments, reproFileNames, reproFilePath, "lib");

        if (shouldExitWithError) process.exit(1);
      });
    } else {
      try {
        let prepackContent = fs.readFileSync(externalPrepackPath);
        this._reproZip.file("prepack-runtime-bundle.zip", prepackContent);
        this._generateZip(reproArguments, reproFileNames, reproFilePath, "src");
      } catch (err) {
        console.error(`Could not zip prepack from given path: ${err}`);
        process.exit(1);
      }
      if (shouldExitWithError) process.exit(1);
    }
  }
}
