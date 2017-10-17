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
    valueToEdgeRecord: Map<Value, [number, number]>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._valueToEdgeRecord = valueToEdgeRecord;
    this._visitedValues = new Set();
    this._valueToId = new Map();
    this._idSeed = 0;
    this._ancestors = [];
    this._edges = [];

    this._significantNodes = new Set();
    this._significantAncestors = [];
    this._significantEdges = [];
  }

  _valueToEdgeRecord: Map<Value, [number, number]>;
  _valueToId: Map<Value, number>;
  _idSeed: number;
  _visitedValues: Set<Value>;
  _ancestors: Array<Value>;
  _edges: Array<Array<number>>;

  _significantNodes: Set<Value>;
  _significantAncestors: Array<Value>;
  _significantEdges: Array<Array<number>>;

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

  _updateEdge(val: Value) {
    if (this._ancestors.length > 0) {
      const parent = this._ancestors[this._ancestors.length - 1];
      this._edges.push([this._getValueId(parent), this._getValueId(val)]);
    }
    this._ancestors.push(val);
  }

  _isSignificantNode(val: Value): boolean {
    const edgeRecord = this._valueToEdgeRecord.get(val);
    invariant(edgeRecord);
    return edgeRecord[0] > 5 || edgeRecord[1] > 5;
  }

  _preMaintainSignificantNode(val: Value) {
    if (this._significantAncestors.length > 0 && this._isSignificantNode(val)) {
      const significantParent = this._significantAncestors[this._significantAncestors.length - 1];
      this._significantEdges.push([this._getValueId(significantParent), this._getValueId(val)]);
    }
    if (this._isSignificantNode(val) || this._significantAncestors.length === 0) {
      this._significantAncestors.push(val);
      this._significantNodes.add(val);
    }
  }

  _mark(val: Value): boolean {
    if (this._shouldIgnore(val)) {
      return true;
    }
    this._updateEdge(val);
    this._preMaintainSignificantNode(val);

    if (this._visitedValues.has(val)) {
      return false; // Already visited.
    }
    this._visitedValues.add(val);
    return true;
  }

  _postMaintainSignificantNode(val: Value) {
    invariant(this._significantAncestors.length > 0);
    if (
      this._isSignificantNode(val) ||
      (this._significantAncestors.length === 1 &&
        val === this._significantAncestors[this._significantAncestors.length - 1])
    ) {
      this._significantAncestors.pop();
    }
  }

  _postProcessValue(val: Value, childrenPassCheck: boolean): boolean {
    if (this._shouldIgnore(val)) {
      return true;
    }
    invariant(this._ancestors.length > 0);
    this._ancestors.pop();

    this._postMaintainSignificantNode(val);
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
    const edgeRecord = this._valueToEdgeRecord.get(val);
    invariant(edgeRecord);
    return `${originalName}_${edgeRecord[0]}_${edgeRecord[1]}`;
  }

  _writeDotFile(nodes: Set<Value>, edges: Array<Array<number>>) {
    const filePath = "/Users/jeffreytan/personal/GraphViz/test.dot";
    let content = "digraph{\n";

    for (const val of nodes) {
      const nodeId = this._getValueId(val);
      content += `  node${nodeId} [shape=${this._getValueShape(val)} label=${this._getValueLabel(val)}];\n`;
    }

    for (const edge of edges) {
      invariant(edge.length === 2);
      content += `  node${edge[0]} -> node${edge[1]};\n`;
    }
    content += "}";
    fs.writeFileSync(filePath, content);
  }

  generateResult() {
    this._writeDotFile(this._significantNodes, this._significantEdges);
  }
}
