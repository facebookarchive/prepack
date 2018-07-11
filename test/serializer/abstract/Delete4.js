// throws introspection error
let x = __abstract("boolean", "true");

let ob1 = { x: 123 };
let ob2 = {
  get x() {
    return 456;
  },
};
let o = x ? ob1 : ob2;

delete o.x;
