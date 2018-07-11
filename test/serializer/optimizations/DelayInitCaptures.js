function f() {
  let x = [];
  let y = [];
  function a() {
    // ================================================= no inline
    x.push("hi");
  }
  function b() {
    // ================================================= no inline
    y.push("bye");
  }
  function c() {
    // ================================================= no inline
    return x.length + y.length;
  }
  return [a, b, c];
}

var res = f();
var a = res[0];
var b = res[1];
var c = res[2];

inspect = function() {
  a();
  b();
  return c();
};
