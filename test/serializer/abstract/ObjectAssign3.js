let ob = global.__abstract ? __abstract({ p: 1 }, "({p: 1})") : { p: 1 };
if (global.__makeSimple) __makeSimple(ob);

Object.assign = function(target, sources) {
  for (let nextIndex = 1; nextIndex < arguments.length; nextIndex++) {
    let nextSource = arguments[nextIndex];
    if (nextSource == null) continue;
    for (var key in nextSource) {
      target[key] = nextSource[key];
    }
  }

  return target;
};

global.z = Object.assign({}, ob);

inspect = function() {
  return global.z.p;
};
