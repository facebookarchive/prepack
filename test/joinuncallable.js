/*---
info: Array.prototype.toString calls %ObjProto_toString% when join uncallable
es5id: 22.1.3.27
description: Checking if toString returns [object Array] on arrays with undefined join method
---*/

var x = [1,2,3];
x.join = undefined;
assert.sameValue(x.toString(), "[object Array]", "Array.prototype.toString() with join uncallable");
