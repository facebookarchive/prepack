// recover-from-errors
// expected errors: [{"location":{"start":{"line":7,"column":18},"end":{"line":7,"column":26},"identifierName":"absSuper","source":"test/error-handler/class.js"},"severity":"RecoverableError","errorCode":"PP0009"}, {"location":{"start":{"line":11,"column":18},"end":{"line":11,"column":28},"identifierName":"superClass","source":"test/error-handler/class.js"},"severity":"RecoverableError","errorCode":"PP0010"}]

let superClass = function() {};
let absSuper = __abstract("object");

class foo extends absSuper {}

superClass.prototype = absSuper;

class bar extends superClass {}
