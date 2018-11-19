// does contain:[11, 22,, 44]
(function() {
  let o = [11, 22, 33, 44];
  Object.defineProperty(o, "2", {
    get: function() {
      return "changed";
    },
  });
  inspect = function() {
    return o[2];
  };
})();
