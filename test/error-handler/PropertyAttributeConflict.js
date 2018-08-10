// recover-from-errors
// expected errors: [{location: {"start":{"line":7,"column":41},"end":{"line":7,"column":42},"source":"test/error-handler/PropertyAttributeConflict.js"}, errorCode: "PP0038", severity: "RecoverableError", message: "unknown descriptor attributes on deleted property"}]

var c = __abstract("boolean", "(true)");
var obj = { x: 1 };
if (c) delete obj.x;
Object.defineProperty(obj, "x", { value: 2 });
inspect = function() {
  return Object.getOwnPropertyDescriptor(obj, "x").enumerable;
};
