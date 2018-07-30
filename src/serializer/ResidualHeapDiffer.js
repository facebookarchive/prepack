/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { Generator } from "../utils/generator.js";
import { Value } from "../values/index.js";

export type NormalizedDiffFunction = {
  name: string,
  params: Array<string>,
  body: Generator,
};

export type NormalizedGeneratorDiffResult = {
  normalizedDiffFunctions: Array<NormalizedDiffFunction>,
  generatorReplacements: Map<
    Generator,
    { args: Array<Value>, func: NormalizedDiffFunction, usesReturn: boolean, usesThis: boolean }
  >,
};

export class ResidualHeapDiffer {
  constructor(realm: Realm, generatorsByHash: Map<string, Set<Generator>>) {
    this.realm = realm;
    this.generatorsByHash = generatorsByHash;
  }
  realm: Realm;
  generatorsByHash: Map<string, Set<Generator>>;

  // returns NormalizedGeneratorDiffResult
  diffAndNormalizeGenerators() {
    // TODO
  }
}
