// add at runtime:global.obj={};
if (global.__assumeDataProperty) __assumeDataProperty(global, "obj", __abstractOrNull("object"));
if (global.__assumeDataProperty) __assumeDataProperty(global, "inspect", undefined);
if (global.__makePartial) __makePartial(global);

let res = "hi";
if (global.obj) res = global.obj;
inspect = function() {
  return res + "";
};
