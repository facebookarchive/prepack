/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Logger } from "../utils/logger.js";
import type { Modules } from "../utils/modules.js";
import type { Realm } from "../realm.js";
import type { ObjectRefCount, AdditionalFunctionEffects } from "./types.js";
import type { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers";

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
import { HeapInspector } from "../utils/HeapInspector.js";
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
    valueIdentifiers: ResidualHeapValueIdentifiers,
    valueToEdgeRecord: Map<Value, ObjectRefCount>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._valueToEdgeRecord = valueToEdgeRecord;
    this._valueIdentifiers = valueIdentifiers;
    this._visitedValues = new Set();
    this._valueIds = new Map();
    this._idSeed = 0;
    this._path = [];
    this._edges = [];
  }

  _valueIdentifiers: ResidualHeapValueIdentifiers;
  _valueToEdgeRecord: Map<Value, ObjectRefCount>;
  _valueIds: Map<Value, number>;
  _idSeed: number;
  _visitedValues: Set<Value>;
  _path: Array<Value>; // Contains the path of nodes from root to current visiting node.
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
    invariant(this._path.length > 0);
    this._path.pop();
  }

  _getValueId(val: Value): number {
    let id = this._valueIds.get(val);
    if (id === undefined) {
      this._valueIds.set(val, ++this._idSeed);
      id = this._idSeed;
    }
    return id;
  }

  _shouldIgnore(val: Value): boolean {
    return val instanceof EmptyValue || val.isIntrinsic() || HeapInspector.isLeaf(val);
  }

  _updateEdge(val: Value): void {
    if (this._path.length > 0) {
      const parent = this._path[this._path.length - 1];
      this._edges.push({ fromId: this._getValueId(parent), toId: this._getValueId(val) });
    }
    this._path.push(val);
  }

  _getValueLabel(val: Value): string {
    // TODO: does not use ref count yet, figure out how to best visualize it later.
    const serializedId = this._valueIdentifiers.getIdentifier(val);
    invariant(serializedId);
    return val.__originalName !== undefined ? `${serializedId.name}(${val.__originalName})` : serializedId.name;
  }

  _generateDotGraphData(nodes: Set<Value>, edges: Array<Edge>): string {
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

  _generateVisJSGraphData(nodes: Set<Value>, edges: Array<Edge>): string {
    let nodesData = [];
    let edgesData = [];

    for (let node of nodes) {
      const nodeId = this._getValueId(node);
      let nodeData = {
        id: `${nodeId}`,
        label: this._getValueLabel(node),
        shape: this._getValueShape(node),
        color: this._getValueColor(node),
      };
      nodesData.push(nodeData);
    }

    for (let [index, edge] of edges.entries()) {
      let edgeData = {
        id: index,
        from: `${edge.fromId}`,
        to: `${edge.toId}`,
        arrows: "to",
      };
      edgesData.push(edgeData);
    }

    let graphData = {
      nodes: nodesData,
      edges: edgesData,
    };
    return JSON.stringify(graphData);
  }

  // TODO: find a way to comment the meaning of shape => value mapping in final graph language.
  _getValueShape(val: Value): string {
    let shape = null;
    if (val instanceof FunctionValue) {
      shape = "circle";
    } else if (val instanceof AbstractValue) {
      shape = "diamond";
    } else if (val instanceof ProxyValue) {
      shape = "triangle";
    } else if (val instanceof SymbolValue) {
      shape = "star";
    } else if (val instanceof ObjectValue) {
      shape = "box";
    } else {
      shape = "ellipse";
    }
    return shape;
  }

  // TODO: find a way to comment the meaning of shape => value mapping in final graph language.
  _getValueColor(val: Value): string {
    let shape = null;
    if (val instanceof FunctionValue) {
      shape = "red";
    } else if (val instanceof AbstractValue) {
      shape = "green";
    } else if (val instanceof ProxyValue) {
      shape = "orange";
    } else if (val instanceof SymbolValue) {
      shape = "yellow";
    } else if (val instanceof ObjectValue) {
      shape = "#3BB9FF"; // light blue
    } else {
      shape = "grey";
    }
    return shape;
  }

  generateResult(heapGraphFormat: "DotLanguage" | "VISJS"): string {
    return heapGraphFormat === "DotLanguage"
      ? this._generateDotGraphData(this._visitedValues, this._edges)
      : this._generateVisJSGraphData(this._visitedValues, this._edges);
  }
}
