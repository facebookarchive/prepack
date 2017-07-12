// recover-from-errors
// expected errors: [{"location":{"start":{"line":7,"column":3},"end":{"line":7,"column":10},"source":"test/error-handler/objectpattern.js"},"severity":"FatalError","errorCode":"PP0014"}]

let p = __abstract("string", "foo");
let foo = "foo";
({ [foo]: q1 } = { foo: "bar" });
({ [p]: q2 } = { foo: "bar" });
