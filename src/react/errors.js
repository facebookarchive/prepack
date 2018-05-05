/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { type ReactEvaluatedNode } from "../serializer/types.js";
import { FatalError } from "../errors.js";

// ExpectedBailOut is like an error, that gets thrown during the reconcilation phase
// allowing the reconcilation to continue on other branches of the tree, the message
// given to ExpectedBailOut will be assigned to the value.$BailOutReason property and serialized
// as a comment in the output source to give the user hints as to what they need to do
// to fix the bail-out case
export class ExpectedBailOut extends Error {}

// SimpleClassBailOuts only occur when a simple class instance is created and used
// bailing out here will result in a complex class instance being created after
// and an alternative complex class component route being used
export class SimpleClassBailOut extends Error {}

// NewComponentTreeBranch only occur when a complex class is found in a
// component tree and the reconciler can no longer fold the component of that branch
export class NewComponentTreeBranch extends Error {
  constructor(evaluatedNode: ReactEvaluatedNode) {
    super();
    this.evaluatedNode = evaluatedNode;
  }
  evaluatedNode: ReactEvaluatedNode;
}

// Used when an entire React component tree has failed to optimize
// this means there is a programming bug in the application that is
// being Prepacked
export class ReconcilerRenderBailOut extends FatalError {
  constructor(message: string, evaluatedNode: ReactEvaluatedNode) {
    super(message);
    evaluatedNode.status = "BAIL-OUT";
    evaluatedNode.message = message;
    evaluatedNode.children = []; // clear children as they are dead
    this.evaluatedNode = evaluatedNode;
    this.__isReconcilerRenderBailOut = true;
  }
  evaluatedNode: ReactEvaluatedNode;
}

ReconcilerRenderBailOut.__isReconcilerRenderBailOut = true;
