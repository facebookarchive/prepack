// emit concrete model

if (global.__assumeDataProperty) {
  __assumeDataProperty(this, "fooFunc", __abstract("function", "fooFunc"));
  __assumeDataProperty(this, "barUndefined", undefined);
  __assumeDataProperty(this, "barzAbstract", __abstract());
  __assumeDataProperty(global, "inspect", undefined);
} else {
  global.fooFunc = function() {};
  global.barUndefined = undefined;
  global.barzAbstract = undefined;
}
if (global.__makePartial) __makePartial(global);

inspect = function() {
  return global.fooFunc() === undefined && global.barUndefined === undefined && global.barzAbstract === undefined;
};
