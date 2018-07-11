// es6
// does contain:keep me
(function() {
  let f = function() {
    /* keep me */
  };
  let id1 = global.setTimeout(f, 1000);
  let id2 = global.setInterval(f, 1000);
  global.clearTimeout(id1);
  global.clearInterval(id2);
  inspect = function() {
    return true;
  };
})();
