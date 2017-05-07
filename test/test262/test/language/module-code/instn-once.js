// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: Module is instantiated exactly once
esid: sec-moduledeclarationinstantiation
info: |
    [...]
    5. If module.[[Environment]] is not undefined, return
       NormalCompletion(empty).
    6. Let env be NewModuleEnvironment(realm.[[GlobalEnv]]).
    7. Set module.[[Environment]] to env.
    8. For each String required that is an element of
       module.[[RequestedModules]] do,
       a. NOTE: Before instantiating a module, all of the modules it requested
          must be available. An implementation may perform this test at any
          time prior to this point.
       b. Let requiredModule be ? HostResolveImportedModule(module, required).
       c. Perform ? requiredModule.ModuleDeclarationInstantiation().
    [...]
flags: [module]
---*/

import {} from './instn-once.js';
import './instn-once.js';
import * as ns1 from './instn-once.js';
import dflt1 from './instn-once.js';
export {} from './instn-once.js';
import dflt2, {} from './instn-once.js';
export * from './instn-once.js';
import dflt3, * as ns from './instn-once.js';
export default null;

let x;
