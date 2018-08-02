// does not contain:defineProperty
(function() {
  function f() {}
  f.prototype = 42;
  inspect = function() {
    return f.prototype;
  };
})();
