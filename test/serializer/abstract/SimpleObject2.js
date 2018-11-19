// add at runtime: var __a = { success: true }
(function() {
  var template = {};
  if (global.__makeSimple) __makeSimple(template);
  var a = global.__abstract ? __abstract(template, "__a") : { success: true };
  if (!a.success) {
    throw a.exception;
  }
  inspect = function() {
    return JSON.stringify(a);
  };
})();
