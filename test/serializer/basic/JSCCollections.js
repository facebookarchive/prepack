// jsc
(function() {
  let o = new Object();
  let m = new Map();
  m.set(o, o);
  let s = new Set();
  s.add(o);
  inspect = function() {
    return m.size + s.size;
  };
})();
