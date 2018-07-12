function fn(x, oldItems) {
  var items = [];
  for (var i; i < x; ) {
    i++;
    var oldItem = oldItems[i];
    items.push(oldItem + 2);
  }
  return items;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify(fn(5, [1, 2, 3, 4, 5]));
};
