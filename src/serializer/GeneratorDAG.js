/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import invariant from "../invariant.js";
import { FunctionValue, ObjectValue } from "../values/index.js";
import { Generator } from "../utils/generator.js";

// This class maintains a DAG containing all generators known so far,
// and information about the most specific generator that created any
// particular object.
// New sub-DAGs are added in chunks, at the beginning for the global generator,
// and every time the visitor handles another additional function.
// NOTE: The serializer can only properly handle Generator trees, not actual DAGs.
export class GeneratorDAG {
  parents: Map<Generator, Array<Generator | FunctionValue | "GLOBAL">>;
  createdObjects: Map<ObjectValue, Generator>;

  constructor() {
    this.parents = new Map();
    this.createdObjects = new Map();
  }

  // DAG TODO: This function is dubious in the presence of actual dags.
  getParent(generator: Generator): Generator | FunctionValue | "GLOBAL" {
    let a = this.parents.get(generator);
    invariant(a !== undefined && a.length >= 1);
    return a[0];
  }

  isParent(parent: Generator | FunctionValue | "GLOBAL", generator: Generator): boolean {
    let a = this.parents.get(generator);
    return a !== undefined && a.includes(parent);
  }

  getCreator(value: ObjectValue): Generator | void {
    return this.createdObjects.get(value);
  }

  add(parent: FunctionValue | "GLOBAL", generator: Generator): void {
    this._add(parent, generator);
  }

  _add(parent: Generator | FunctionValue | "GLOBAL", generator: Generator): void {
    let a = this.parents.get(generator);
    if (a === undefined) this.parents.set(generator, (a = []));
    if (!a.includes(parent)) a.push(parent);
    let effects = generator.effectsToApply;
    if (effects !== undefined)
      for (let createdObject of effects.createdObjects) {
        let isValidPreviousCreator = previousCreator => {
          // It's okay if we don't know about any previous creator.
          if (previousCreator === undefined) return true;

          // If we already recorded a newly-created object, then we must have done so for our parent
          if (previousCreator === parent) return true;

          // Since we are dealing with a DAG, and not a tree, we might have already the current generator as the creator
          if (previousCreator === generator) return true;

          // TODO: There's something else going on that is not yet understood.
          // Fix the return value once #1901 is understood and landed.
          return true; // false
        };

        invariant(isValidPreviousCreator(this.createdObjects.get(createdObject)));

        // Update the created objects mapping to the most specific generator
        this.createdObjects.set(createdObject, generator);
      }

    for (let dependency of generator.getDependencies()) this._add(generator, dependency);
  }
}
