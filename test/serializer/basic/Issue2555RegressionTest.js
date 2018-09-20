(function() {
  function A() {
    B;
  }
  function B() {}

  let p = Object.create(A.prototype);
  B.prototype = Object.create(p);

  global.inspect = function() {
    return p.prototype === A;
  };
})();
