/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 */
(function() {
  var isStrict = function() {
    "use strict";
    return !!this;
  };
  inspect = function() {
    return isStrict();
  };
})();
