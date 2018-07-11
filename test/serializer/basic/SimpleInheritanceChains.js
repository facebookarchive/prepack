(function() {
  function A() {}
  function B() {}
  B.prototype = Object.create(A.prototype);
  inspect = function() {
    return A.prototype === B.prototype.__proto__;
  };
})();
