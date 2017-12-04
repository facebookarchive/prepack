/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Logger } from "./logger.js";
import type { Modules } from "./modules.js";
import type { Realm } from "../realm.js";
import type { Effects } from "../realm.js";
import type { ObjectRefCount } from "./types.js";

import invariant from "../invariant.js";
import {
  Value,
  EmptyValue,
  FunctionValue,
  AbstractValue,
  SymbolValue,
  ProxyValue,
  ObjectValue,
} from "../values/index.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";

type Edge = {
  fromId: number,
  toId: number,
};

/**
 * Generate a visualizable objects graph for Prepack heap.
 */
export class ResidualHeapGraphGenerator extends ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>,
    valueToEdgeRecord: Map<Value, ObjectRefCount>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._valueToEdgeRecord = valueToEdgeRecord;
    this._visitedValues = new Set();
    this._valueIds = new Map();
    this._idSeed = 0;
    this._ancestors = [];
    this._edges = [];
  }

  _valueToEdgeRecord: Map<Value, ObjectRefCount>;
  _valueIds: Map<Value, number>;
  _idSeed: number;
  _visitedValues: Set<Value>;
  _ancestors: Array<Value>;
  _edges: Array<Edge>;

  // Override.
  preProcessValue(val: Value): boolean {
    if (this._shouldIgnore(val)) {
      return true;
    }
    this._updateEdge(val);

    if (this._visitedValues.has(val)) {
      return false; // Already visited.
    }
    this._visitedValues.add(val);
    return true;
  }

  // Override.
  postProcessValue(val: Value): void {
    if (this._shouldIgnore(val)) {
      return;
    }
    invariant(this._ancestors.length > 0);
    this._ancestors.pop();
  }

  _getValueId(val: Value): number {
    let id = this._valueIds.get(val);
    if (!id) {
      this._valueIds.set(val, ++this._idSeed);
      id = this._idSeed;
    }
    return id;
  }

  _shouldIgnore(val: Value): boolean {
    return val instanceof EmptyValue || val.isIntrinsic() || ResidualHeapInspector.isLeaf(val);
  }

  _updateEdge(val: Value) {
    if (this._ancestors.length > 0) {
      const parent = this._ancestors[this._ancestors.length - 1];
      this._edges.push({ fromId: this._getValueId(parent), toId: this._getValueId(val) });
    }
    this._ancestors.push(val);
  }

  _getValueLabel(val: Value): string {
    // TODO: add object identifier in label.
    // TODO: does not use ref count yet, figure out how to best visualize it later.
    return val.__originalName || "";
  }

  _generateDotGraph(nodes: Set<Value>, edges: Array<Edge>): string {
    let content = "digraph{\n";

    for (const val of nodes) {
      const nodeId = this._getValueId(val);
      content += `  node${nodeId} [shape=${this._getValueShape(val)} label=${this._getValueLabel(val)}];\n`;
    }

    for (const edge of edges) {
      content += `  node${edge.fromId} -> node${edge.toId};\n`;
    }
    content += "}";
    return content;
  }

  // TODO: find a way to comment the meaning of shape => value mapping in final graph language.
  _getValueShape(val: Value): string {
    let shape = null;
    if (val instanceof FunctionValue) {
      shape = "circle";
    } else if (val instanceof AbstractValue) {
      shape = "star";
    } else if (val instanceof ProxyValue) {
      shape = "house";
    } else if (val instanceof SymbolValue) {
      shape = "diamond";
    } else if (val instanceof ObjectValue) {
      shape = "box";
    } else {
      shape = "tripleoctagon";
    }
    return shape;
  }

  generateResult(): string {
    return this._generateDotGraph(this._visitedValues, this._edges);
  }
}
