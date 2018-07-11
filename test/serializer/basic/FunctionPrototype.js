(function() {
  function f() {}
  let p = f.prototype;
  inspect = function() {
    return p === f.prototype;
  };
})();
