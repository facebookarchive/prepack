function Model(x, oldItems) {
  this.items = [];
  for (let i = 0; i < 10; i++) {
    for (let i = 0; i < x; i++) {
      var oldItem = oldItems[i];
      this.items.push(oldItem + 2);
    }
  }
}

global.__optimize && __optimize(Model);

inspect = function() {
  var model = new Model(5, [1, 2, 3, 4, 5]);
  return JSON.stringify(model.items);
};
