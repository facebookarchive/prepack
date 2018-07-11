(function() {
  let v;
  function init() {
    init = function() {};
    v = {};
  }
  function work() {
    let a = (init(), v);
    let b = (init(), v);
    return a == b;
  }
  global.inspect = work;
})();
