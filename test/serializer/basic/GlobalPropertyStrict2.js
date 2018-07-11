(function() {
  "use strict";
  function a(x) {
    return x;
  }
  global.a = a;
})();
inspect = function() {
  return global.a(22);
};
