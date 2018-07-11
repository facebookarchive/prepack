if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

var symbol = Symbol();

var result = __evaluatePureFunction(() => {
  var obj = { y: 0 };
  var somethingUnknown = global.__abstract
    ? __abstract(undefined, "({set x(v) { v.y++; }})")
    : {
        set x(v) {
          v.y++;
        },
      };
  somethingUnknown.x = obj;
  return obj.y;
});

inspect = function() {
  return result;
};
