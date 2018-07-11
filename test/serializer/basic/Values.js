function g(i) {
  function f() {
    /* This comment is here so that the function gets too big to be considered for inlining by our serialiser. */
    return i + arguments[0];
  }
  return f;
}
var h0 = g(0);
var h1 = g(1);

inspect = function() {
  return h1(42) - h0(42);
};
