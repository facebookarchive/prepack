// does not contain:instanceof

function fn(x) {
  if (undefined instanceof x) {
    return "impossible";
  }
  if (null instanceof x) {
    return "also impossible";
  }
  if (false instanceof x) {
    return "also impossible 2";
  }
  if (true instanceof x) {
    return "also impossible 3";
  }
  if (0 instanceof x) {
    return "also impossible 4";
  }
  if (1 instanceof x) {
    return "also impossible 5";
  }
  if ("" instanceof x) {
    return "also impossible 6";
  }
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(Object)
};
