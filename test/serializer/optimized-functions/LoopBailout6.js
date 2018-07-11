function fn(x, oldItems) {
  var items = [];
  var i = 0;
  while (i < x) {
    var oldItem = oldItems[i];
    items.push(oldItem + 2);
    i++;
  }
  return items;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify(fn(5, [1, 2, 3, 4, 5]));
};
