(function() {
  let a = global.__abstract ? __abstract("boolean", "(true)") : true;
  let obj = {};
  global.early = obj; // assignments to intrinsics are emitted in chronological order via the generator
  if (a) {
    obj.f = Date.now(); // calls to Date.now() are also emitted along the same timeline, so this comes later
  } else {
    obj.f = -1;
  }
  inspect = function() {
    return a ? obj.f > 0 : obj.f < 0;
  };
})();
