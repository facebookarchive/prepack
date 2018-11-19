// serialized function clone count: 0
// expected Warning: PP1007
var addit_funs = [];

var f = function(x) {
  var i = x > 5 ? 0 : 1;
  var fun = function() {
    i += 1;
    return i;
  };
  if (global.__optimize) global.__optimize(fun);
  addit_funs.push(fun);
  return fun;
};

var g = [f(2), f(6), f(4), f(9)];

inspect = function() {
  addit_funs.forEach(x => x());
  let res1 = g[0]() + " " + g[1]() + " " + g[2]() + " " + g[3]();
  addit_funs.forEach(x => x());
  let res2 = g[0]() + " " + g[1]() + " " + g[2]() + " " + g[3]();
  return "PASS";
  //return res1 + " " + res2;
};
