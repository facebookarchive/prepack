// omit invariants
// add at runtime:global.obj={};
if (global.__assumeDataProperty) __assumeDataProperty(global, "obj", __abstractOrNull("object"));
if (global.__assumeDataProperty) __assumeDataProperty(global, "inspect", undefined);
if (global.__makePartial) __makePartial(global);

let res;
if (global.obj) res = global.obj;
let x = !!res ? (res ? {} : undefined) : null;
let y = !!(!res ? null : {});
let z = y ? (!res ? 1 : 2) : 3;
inspect = function() {
  return res + " " + x + " " + y + " " + z;
};
