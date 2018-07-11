// add at runtime:global.obj={}; global.func = function() { return 5; };
if (global.__assumeDataProperty) __assumeDataProperty(global, "obj", __abstractOrNull("object"));
if (global.__assumeDataProperty) __assumeDataProperty(global, "func", __abstract("function"));
if (global.__assumeDataProperty) __assumeDataProperty(global, "inspect", undefined);
if (global.__makePartial) __makePartial(global);

let foo = {};
if (global.obj) foo = global.obj;
inspect = function() {
  return " " + (global.obj === foo) + " " + global.func();
};
