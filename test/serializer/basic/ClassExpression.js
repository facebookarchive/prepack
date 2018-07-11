const Foo = class {
  constructor() {
    this.x = 10;
  }
  method(y) {
    return this.x + y;
  }
};

inspect = function() {
  var foo = new Foo();
  return [foo, foo.method(10)];
};
