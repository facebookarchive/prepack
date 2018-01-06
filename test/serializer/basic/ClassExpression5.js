x = 0;

class Bar {
  constructor(y) {
    x = y + 10;
  }
}

class Foo extends Bar {
  constructor(y) {
    super(y);
  }
}

new Foo(1);

inspect = function() { return x; }