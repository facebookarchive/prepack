(function() {
  var obj = {};
  function additional() {
    global.nested = function() {
      obj = {};
      obj.p = 100;
      return obj;
    };
    return obj;
  }
  if (global.__registerAdditionalFunctionToPrepack) {
    global.__registerAdditionalFunctionToPrepack(additional);
  }
  inspect = function() {
    additional();
    return JSON.stringify(nested());
  };
})();
