method1 = Symbol();

class Foo {
  constructor() {
    this.x = 10;
  }
  ['method'](y) {
    return this.x + y;
  }
}

class Bar extends Foo {
  [method1](z) {
    return this.x + this.y + z;
  }
  get y() {
    return 10;
  }
  set y(x) {
    // NO-OP
  }
}

inspect = function() { 
  var foo = new Bar(); 
  return [foo, foo[method1](10)]
}