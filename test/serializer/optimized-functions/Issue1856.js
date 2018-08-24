let p = {};
function f(c) {
  let o = {};
  if (c) {
    o.__proto__ = p;
    throw o;
  }
}
if (global.__optimize) __optimize(f);
inspect = function() {
  try {
    f(true);
  } catch (e) {
    return e.$Prototype === p;
  }
};
