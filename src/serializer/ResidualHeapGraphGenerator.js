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
import fs from "fs";

export class ResidualHeapGraphGenerator extends ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>,
    valueToReferencCount: Map<Value, number>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._valueToReferencCount = valueToReferencCount;
    this._visitedValues = new Set();
    this._valueToId = new Map();
    this._idSeed = 0;
    this._ancestors = [];
    this._edges = [];
  }

  _valueToReferencCount: Map<Value, number>;
  _valueToId: Map<Value, number>;
  _idSeed: number;
  _visitedValues: Set<Value>;
  _ancestors: Array<Value>;
  _edges: Array<Array<number>>;

  _getValueId(val: Value): number {
    let id = this._valueToId.get(val);
    if (!id) {
      this._valueToId.set(val, ++this._idSeed);
      id = this._idSeed;
    }
    return id;
  }

  _shouldIgnore(val: Value): boolean {
    return val instanceof EmptyValue || val.isIntrinsic() || ResidualHeapInspector.isLeaf(val);
  }

  _mark(val: Value): boolean {
    if (this._shouldIgnore(val)) {
      return true;
    }

    if (this._ancestors.length > 0) {
      const parent = this._ancestors[this._ancestors.length - 1];
      this._edges.push([this._getValueId(parent), this._getValueId(val)]);
    }
    this._ancestors.push(val);

    if (this._visitedValues.has(val)) {
      return false; // Already visited.
    }
    this._visitedValues.add(val);
    return true;
  }

  _postProcessValue(val: Value, childrenPassCheck: boolean): boolean {
    if (this._shouldIgnore(val)) {
      return true;
    }

    invariant(this._ancestors.length > 0);
    this._ancestors.pop();
    return true;
  }

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

  _getValueLabel(val: Value): string {
    const originalName = val.__originalName || "";
    const refCount = this._valueToReferencCount.get(val);
    invariant(refCount);
    return `${originalName}_${refCount}`;
  }

  generateResult() {
    const filePath = "/Users/jeffreytan/personal/GraphViz/lazyobject.dot";
    let content = "digraph{\n";

    for (const [val, nodeId] of this._valueToId) {
      content += `  node${nodeId} [shape=${this._getValueShape(val)} label=${this._getValueLabel(val)}];\n`;
    }

    for (const edge of this._edges) {
      invariant(edge.length === 2);
      content += `  node${edge[0]} -> node${edge[1]};\n`;
    }
    content += "}";
    fs.writeFileSync(filePath, content);
  }
}
