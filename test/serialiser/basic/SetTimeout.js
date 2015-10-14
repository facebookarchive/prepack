var st = global.setTimeout;
global.setTimeout = function(x) {
  return st(x, y);
}

inspect = function() { return (global.setTimeout ? "global.setTimeout" : "") + (st ? "st" : ""); }