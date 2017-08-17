(function() {
  "use strict";
  function a(x) {
    return x;
  }
  global.a = a;
})();
inspect = function() { return a(22); }
