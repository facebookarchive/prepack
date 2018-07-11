// does contain:[11, 22
(function() {
  let x = global.__abstract ? __abstract("boolean", "true") : true;
  let o = [];
  o.push(11);
  o.push(22);
  if (x) {
    o.push(3);
  } else {
  }
  inspect = function() {
    return o;
  };
})();
