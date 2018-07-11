if (global.__assumeDataProperty) __assumeDataProperty(global, "special-identifier", undefined);
if (global.__assumeDataProperty) __assumeDataProperty(global, "inspect", undefined);
if (global.__makePartial) __makePartial(global);
global["special-identifier"] = 42;
inspect = function() {
  return global["special-identifier"];
};
