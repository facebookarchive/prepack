function Model(x, oldItems) {
  this.oldItems = oldItems;
  var items = [];
  for (let i = 0; i < x; i++) {
    var oldItem = this.oldItems[i];
    items.push(oldItem + 2);
  }
  this.items = items;
}

global.__optimize && __optimize(Model);

inspect = function() {
  var model = new Model(5, [1, 2, 3, 4, 5]);
  return JSON.stringify(model.items);
};
