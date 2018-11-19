global.method1 = Symbol();

class Foo {
  constructor() {
    this.x = 10;
  }
  ["method"](y) {
    return this.x + y;
  }
}

global.Bar = class extends Foo {
  [global.method1](z) {
    return this.x + this.y + z;
  }
  get y() {
    return 10;
  }
  set y(x) {
    // NO-OP
  }
};

inspect = function() {
  var foo = new global.Bar();
  return [foo, foo[global.method1](10)];
};
