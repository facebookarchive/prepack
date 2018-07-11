// es6
var st = global.setTimeout;
var y;
global.setTimeout = function(x) {
  return st(x, y);
};

inspect = function() {
  return (global.setTimeout ? "global.setTimeout" : "") + (st ? "st" : "");
};
