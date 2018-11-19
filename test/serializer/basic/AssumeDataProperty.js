if (global.__assumeDataProperty) __assumeDataProperty(global, "o", undefined);
if (global.__assumeDataProperty) __assumeDataProperty(global, "inspect", undefined);
if (global.__makePartial) __makePartial(global);
var o = 42;
inspect = function() {
  return o;
};
