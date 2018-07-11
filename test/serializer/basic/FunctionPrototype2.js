(function() {
  function f() {}
  f.prototype.foo = 42;
  inspect = function() {
    return f.prototype.foo;
  };
})();
