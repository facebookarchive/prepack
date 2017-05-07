// Copyright (C) 2015 Mike Pennisi. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-array.prototype-@@unscopables
description: >
    Initial value of `Symbol.unscopables` property
info: |
    22.1.3.32 Array.prototype [ @@unscopables ]

    1. Let unscopableList be ObjectCreate(null).
    2. Perform CreateDataProperty(unscopableList, "copyWithin", true).
    3. Perform CreateDataProperty(unscopableList, "entries", true).
    4. Perform CreateDataProperty(unscopableList, "fill", true).
    5. Perform CreateDataProperty(unscopableList, "find", true).
    6. Perform CreateDataProperty(unscopableList, "findIndex", true).
    7. Perform CreateDataProperty(unscopableList, "includes", true).
    8. Perform CreateDataProperty(unscopableList, "keys", true).
    9. Perform CreateDataProperty(unscopableList, "values", true).
    10. Assert: Each of the above calls will return true.
    11. Return unscopableList.
includes: [propertyHelper.js]
features: [Symbol.unscopables]
---*/

var unscopables = Array.prototype[Symbol.unscopables];

assert.sameValue(Object.getPrototypeOf(unscopables), null);

assert.sameValue(unscopables.copyWithin, true, '`copyWithin` property value');
verifyEnumerable(unscopables, 'copyWithin');
verifyWritable(unscopables, 'copyWithin');
verifyConfigurable(unscopables, 'copyWithin');

assert.sameValue(unscopables.entries, true, '`entries` property value');
verifyEnumerable(unscopables, 'entries');
verifyWritable(unscopables, 'entries');
verifyConfigurable(unscopables, 'entries');

assert.sameValue(unscopables.fill, true, '`fill` property value');
verifyEnumerable(unscopables, 'fill');
verifyWritable(unscopables, 'fill');
verifyConfigurable(unscopables, 'fill');

assert.sameValue(unscopables.find, true, '`find` property value');
verifyEnumerable(unscopables, 'find');
verifyWritable(unscopables, 'find');
verifyConfigurable(unscopables, 'find');

assert.sameValue(unscopables.findIndex, true, '`findIndex` property value');
verifyEnumerable(unscopables, 'findIndex');
verifyWritable(unscopables, 'findIndex');
verifyConfigurable(unscopables, 'findIndex');

assert.sameValue(unscopables.includes, true, '`includes` property value');
verifyEnumerable(unscopables, 'includes');
verifyWritable(unscopables, 'includes');
verifyConfigurable(unscopables, 'includes');

assert.sameValue(unscopables.keys, true, '`keys` property value');
verifyEnumerable(unscopables, 'keys');
verifyWritable(unscopables, 'keys');
verifyConfigurable(unscopables, 'keys');

assert.sameValue(unscopables.values, true, '`values` property value');
verifyEnumerable(unscopables, 'values');
verifyWritable(unscopables, 'values');
verifyConfigurable(unscopables, 'values');
