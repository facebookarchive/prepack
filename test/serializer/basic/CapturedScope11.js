var addit_funs = [];

var f = function(x) {
  var i = x > 5 ? 0 : 1;
  var fun = function() {
    i += 1;
    return i;
  };
  addit_funs.push(fun);
  return fun;
};

var g = [f(2), f(6), f(4), f(9)];
g.forEach(x => x());

inspect = function() {
  let res1 = g[0]() + " " + g[1]() + " " + g[2]() + " " + g[3]();
  addit_funs.forEach(x => x());
  let res2 = g[0]() + " " + g[1]() + " " + g[2]() + " " + g[3]();
  return res1 + " " + res2;
};
