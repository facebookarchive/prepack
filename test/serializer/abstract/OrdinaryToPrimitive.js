// throws introspection error
let x = {
  toString() {
    return Math.random() ? "a" : "b";
  },
};
new Date(x);
