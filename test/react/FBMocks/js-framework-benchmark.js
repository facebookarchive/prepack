// Adpted from https://github.com/krausest/js-framework-benchmark

var React = require("react");

const _random = max => {
  return Math.round(Math.random() * 1000) % max;
};
const updateData = (data, mod = 10) => {
  const newData = [...data];
  for (let i = 0; i < newData.length; i += 10) {
    newData[i] = Object.assign({}, newData[i], { label: newData[i].label + " !!!" });
  }
  return newData;
};
const buildData = (id, count = 1000) => {
  var adjectives = [
    "pretty",
    "large",
    "big",
    "small",
    "tall",
    "short",
    "long",
    "handsome",
    "plain",
    "quaint",
    "clean",
    "elegant",
    "easy",
    "angry",
    "crazy",
    "helpful",
    "mushy",
    "odd",
    "unsightly",
    "adorable",
    "important",
    "inexpensive",
    "cheap",
    "expensive",
    "fancy",
  ];
  var colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
  var nouns = [
    "table",
    "chair",
    "house",
    "bbq",
    "desk",
    "car",
    "pony",
    "cookie",
    "sandwich",
    "burger",
    "pizza",
    "mouse",
    "keyboard",
  ];
  var data = [];
  for (var i = 0; i < count; i++)
    data.push({
      id: id++,
      label:
        adjectives[_random(adjectives.length)] +
        " " +
        colours[_random(colours.length)] +
        " " +
        nouns[_random(nouns.length)],
    });
  return { data, id };
};

const add = (id, data) => {
  const newData = buildData(id, 1000);

  return { data: [...data, ...newData.data], id: newData.id };
};
const run = id => {
  return buildData(id);
};
const runLots = id => {
  return buildData(id, 10000);
};
const update = data => {
  return updateData(data);
};

const swapRows = data => {
  const newData = [...data];
  if (newData.length > 998) {
    let temp = newData[1];
    newData[1] = newData[998];
    newData[998] = temp;
  }
  return newData;
};
const deleteRow = (data, id) => {
  return data.filter(d => {
    return d.id != id;
  });
};

let startTime;
let lastMeasure;

const startMeasure = function(name) {
  startTime = performance.now();
  lastMeasure = name;
};

const stopMeasure = function() {
  var last = lastMeasure;
  if (lastMeasure) {
    window.setTimeout(function() {
      lastMeasure = null;
      var stop = performance.now();
      var duration = 0;
      console.log(last + " took " + (stop - startTime));
    }, 0);
  }
};

class Main extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [],
      selected: undefined,
      id: 1,
    };
    this.select = this.select.bind(this);
    this.delete = this.delete.bind(this);
    this.add = this.add.bind(this);
    this.run = this.run.bind(this);
    this.update = this.update.bind(this);
    this.runLots = this.runLots.bind(this);
    this.clear = this.clear.bind(this);
    this.swapRows = this.swapRows.bind(this);
    this.start = 0;
  }
  printDuration() {
    stopMeasure();
  }
  componentDidUpdate() {
    this.printDuration();
  }
  componentDidMount() {
    this.printDuration();
  }
  run() {
    startMeasure("run");
    const { id } = this.state;
    const obj = run(id);
    this.setState({ data: obj.data, id: obj.id, selected: undefined });
  }
  add() {
    startMeasure("add");
    const { id } = this.state;
    const obj = add(id, this.state.data);
    this.setState({ data: obj.data, id: obj.id });
  }
  update() {
    startMeasure("update");
    const data = update(this.state.data);
    this.setState({ data: data });
  }
  select(id) {
    startMeasure("select");
    this.setState({ selected: id });
  }
  delete(id) {
    startMeasure("delete");
    const data = deleteRow(this.state.data, id);
    this.setState({ data: data });
  }
  runLots() {
    startMeasure("runLots");
    const { id } = this.state;
    const obj = runLots(id);
    this.setState({ data: obj.data, id: obj.id, selected: undefined });
  }
  clear() {
    startMeasure("clear");
    this.setState({ data: [], selected: undefined });
  }
  swapRows() {
    startMeasure("swapRows");
    const data = swapRows(this.state.data);
    this.setState({ data: data });
  }

  shouldComponentUpdate(nextProps, nextState) {
    const { data, selected } = this.state;
    const nextData = nextState.data;
    const nextSelected = nextState.selected;
    return !(data.length === nextData.length && data.every((v, i) => v === nextData[i])) || selected != nextSelected;
  }
  render() {
    let rows = Array.from(this.state.data).map((d, i) => {
      return (
        <Row
          key={d.id}
          data={d}
          onClick={this.select}
          onDelete={this.delete}
          styleClass={d.id === this.state.selected ? "danger" : ""}
        />
      );
    });
    return (
      <div className="container">
        <div className="jumbotron">
          <div className="row">
            <div className="col-md-6">
              <h1>React keyed</h1>
            </div>
            <div className="col-md-6">
              <div className="row">
                <div className="col-sm-6 smallpad">
                  <button type="button" className="btn btn-primary btn-block" id="run" onClick={this.run}>
                    Create 1,000 rows
                  </button>
                </div>
                <div className="col-sm-6 smallpad">
                  <button type="button" className="btn btn-primary btn-block" id="runlots" onClick={this.runLots}>
                    Create 10,000 rows
                  </button>
                </div>
                <div className="col-sm-6 smallpad">
                  <button type="button" className="btn btn-primary btn-block" id="add" onClick={this.add}>
                    Append 1,000 rows
                  </button>
                </div>
                <div className="col-sm-6 smallpad">
                  <button type="button" className="btn btn-primary btn-block" id="update" onClick={this.update}>
                    Update every 10th row
                  </button>
                </div>
                <div className="col-sm-6 smallpad">
                  <button type="button" className="btn btn-primary btn-block" id="clear" onClick={this.clear}>
                    Clear
                  </button>
                </div>
                <div className="col-sm-6 smallpad">
                  <button type="button" className="btn btn-primary btn-block" id="swaprows" onClick={this.swapRows}>
                    Swap Rows
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <table className="table table-hover table-striped test-data">
          <tbody>{rows}</tbody>
        </table>
        <span className="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
      </div>
    );
  }
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Main);
}

class Row extends React.Component {
  constructor(props) {
    super(props);
    this.onDelete = this.onDelete.bind(this);
    this.onClick = this.onClick.bind(this);
  }
  shouldComponentUpdate(nextProps, nextState) {
    return nextProps.data !== this.props.data || nextProps.styleClass !== this.props.styleClass;
  }
  onDelete() {
    this.props.onDelete(this.props.data.id);
  }
  onClick() {
    this.props.onClick(this.props.data.id);
  }
  render() {
    let { styleClass, onClick, onDelete, data } = this.props;
    return (
      <tr className={styleClass}>
        <td className="col-md-1">{data.id}</td>
        <td className="col-md-4">
          <a onClick={this.onClick}>{data.label}</a>
        </td>
        <td className="col-md-1">
          <a onClick={this.onDelete}>
            <span className="glyphicon glyphicon-remove" aria-hidden="true" />
          </a>
        </td>
        <td className="col-md-6" />
      </tr>
    );
  }
}

Main.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["js-framework-benchmark", renderer.toJSON()]];
};

module.exports = Main;
