function func1(v) {
  if (v == null) return null;
  var a = v.a;
  if (a == null) return null;
  return a;
}

if (global.__optimize) __optimize(func1);

inspect = function() {
  return func1();
};
