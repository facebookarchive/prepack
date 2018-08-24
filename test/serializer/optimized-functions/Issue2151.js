function bad(v) {
  if (v == null) {
    return null;
  }
  var a = v.a,
    b = v.b;
  if (a == null || b == null) {
    return a && b;
  }
  return v;
}

if (global.__optimize) __optimize(bad);

inspect = function() {
  return bad(null);
};
