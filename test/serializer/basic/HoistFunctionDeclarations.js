(function() {
  function f() {
    return obj.f;
  }
  let obj = { f: f.prototype };
  obj.obj = obj;
  inspect = function() {
    return f() === obj.f;
  };
})();
