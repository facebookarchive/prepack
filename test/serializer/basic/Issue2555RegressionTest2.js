(function() {
  function createClass(ctor, superClass) {
    if (superClass) {
      ctor.prototype = Object.create(superClass.prototype);
    }
    ctor.prototype.constructor = ctor;
  }

  function mixin(ctor, methods) {
    var keyCopier = function(key) {
      ctor.prototype[key] = methods[key];
    };
    Object.keys(methods).forEach(keyCopier);
    Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(methods).forEach(keyCopier);
    return ctor;
  }

  function Iterable(value) {}
  function Iterator(next) {}

  createClass(Seq, Iterable);
  function Seq(value) {}

  createClass(IndexedSeq, Seq);
  function IndexedSeq(value) {}

  createClass(SetSeq, Seq);
  function SetSeq(value) {
    indexedSeqFromValue;
  }

  SetSeq.prototype.toSetSeq = function() {
    return this;
  };

  Seq.isSeq = isSeq;
  Seq.Set = SetSeq;
  Seq.Indexed = IndexedSeq;

  createClass(ArraySeq, IndexedSeq);
  function ArraySeq(array) {}

  createClass(IterableSeq, IndexedSeq);
  function IterableSeq(iterable) {}

  createClass(IteratorSeq, IndexedSeq);
  function IteratorSeq(iterator) {}

  createClass(ToIndexedSequence, IndexedSeq);
  function ToIndexedSequence(iter) {}

  Iterable.Iterator = Iterator;

  mixin(Iterable, {
    foo: function() {
      ToIndexedSequence;
    },
  });

  function isSeq(maybeSeq) {}

  function indexedSeqFromValue(value) {
    maybeIndexedSeqFromValue;
  }

  function seqFromValue(value) {
    ObjectSeq;
  }

  function maybeIndexedSeqFromValue(value) {
    ArraySeq;
    IteratorSeq;
    IterableSeq;
  }

  global.foo = Iterable;

  global.inspect = function() {
    return true;
  }; // This test only exists to test against an ordering in the code generation which the linter would detect.
})();
