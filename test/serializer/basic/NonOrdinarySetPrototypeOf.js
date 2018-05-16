const root = {};
const proxy = new Proxy(Object.create(root), {});
const leaf = Object.create(proxy);

// This should not detect a cycle,
// because proxy does not use the
// ordinary object definition for [[SetPrototypeOf]].
// See also test262/test/annexB/built-ins/Object/prototype/__proto__/set-cycle-shadowed.js
Object.setPrototypeOf(root, leaf);

inspect = function() {
  return (
    Object.getPrototypeOf(root) === leaf &&
    Object.getPrototypeOf(leaf) === proxy &&
    Object.getPrototypeOf(proxy) === root
  );
};
