function g(i) {
  function f() {
    /* This function is too big to be inlined! */
    return i + arguments[0];
  }
  return f;
}
var h0 = g(0);
var h1 = g(1);

inspect = function() {
  return h1(42) - h0(42);
};
