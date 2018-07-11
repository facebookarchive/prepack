var f = (function() {
  var Map2 = function() {
    return Map2;
  };
  return Map2;
})();

inspect = function() {
  return f() == f()() ? true : false;
};
