/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type {
  ConcretizeType,
  CreateType,
  EnvironmentType,
  FunctionType,
  LeakType,
  JoinType,
  MaterializeType,
  PathType,
  PathConditions,
  PropertiesType,
  ReachabilityType,
  ToType,
  UtilsType,
  WidenType,
  DebugReproManagerType,
} from "./types.js";

export let Create: CreateType = (null: any);
export let Environment: EnvironmentType = (null: any);
export let Functions: FunctionType = (null: any);
export let Leak: LeakType = (null: any);
export let Materialize: MaterializeType = (null: any);
export let Reachability: ReachabilityType = (null: any);
export let Join: JoinType = (null: any);
export let Path: PathType = (null: any);
export let createPathConditions: (PathConditions | void) => PathConditions = (null: any);
export let Properties: PropertiesType = (null: any);
export let To: ToType = (null: any);
export let Widen: WidenType = (null: any);
export let concretize: ConcretizeType = (null: any);

export let Utils: UtilsType = (null: any);
export let DebugReproManager: DebugReproManagerType = (null: any);

export function setCreate(singleton: CreateType): void {
  Create = singleton;
}

export function setEnvironment(singleton: EnvironmentType): void {
  Environment = singleton;
}

export function setFunctions(singleton: FunctionType): void {
  Functions = singleton;
}

export function setLeak(singleton: LeakType): void {
  Leak = singleton;
}

export function setMaterialize(singleton: MaterializeType): void {
  Materialize = singleton;
}

export function setReachability(singleton: ReachabilityType): void {
  Reachability = singleton;
}
export function setJoin(singleton: JoinType): void {
  Join = singleton;
}

export function setPath(singleton: PathType): void {
  Path = singleton;
}

export function setPathConditions(f: (PathConditions | void) => PathConditions): void {
  createPathConditions = f;
}

export function setProperties(singleton: PropertiesType): void {
  Properties = singleton;
}

export function setTo(singleton: ToType): void {
  To = singleton;
}

export function setWiden(singleton: WidenType): void {
  Widen = singleton;
}

export function setConcretize(singleton: ConcretizeType): void {
  concretize = singleton;
}

export function setUtils(singleton: UtilsType): void {
  Utils = singleton;
}

export function setDebugReproManager(singleton: DebugReproManagerType): void {
  DebugReproManager = singleton;
}
