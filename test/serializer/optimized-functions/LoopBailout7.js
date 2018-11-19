// expected Warning,RecoverableError: PP1007, PP0023, PP1002
// throws introspection error
function fn(x, oldItems) {
  var items = [];
  for (; i !== x; ) {
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
