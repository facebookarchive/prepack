/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 */
(function() {
  var isStrict = function() {
    "use strict";
    return function() {
      // This function is too big to be inlined.
      return !!this;
    };
  };
  let f1 = isStrict();
  let f2 = isStrict();
  let f3 = isStrict();
  inspect = function() {
    return f1() && f2() && f3();
  };
})();
