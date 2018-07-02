const React = require("React");
const PropTypes = require("PropTypes");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

module.exports = this.__evaluatePureFunction(() => {
  function timeAge(time) {
    const now = new Date(2042, 1, 1).getTime() / 1000;
    const minutes = (now - time) / 60;

    if (minutes < 60) {
      return Math.round(minutes) + " minutes ago";
    }
    return Math.round(minutes / 60) + " hours ago";
  }

  function getHostUrl(url) {
    return (url + "")
      .replace("https://", "")
      .replace("http://", "")
      .split("/")[0];
  }

  function Story({ story, rank }) {
    return (
      <React.Fragment>
        <tr className="athing">
          <td
            style={{
              verticalAlign: "top",
              textAlign: "right",
            }}
            className="title"
          >
            <span className="rank">{rank + "."}</span>
          </td>
          <td
            className="votelinks"
            style={{
              verticalAlign: "top",
            }}
          >
            <center>
              <a href="#">
                <div className="votearrow" titl="upvote" />
              </a>
            </center>
          </td>
          <td className="title">
            <a href="#" className="storylink">
              {story.title}
            </a>
            {story.url ? (
              <span className="sitebit comhead">
                {" ("}
                <a href="#">{getHostUrl(story.url)}</a>)
              </span>
            ) : null}
          </td>
        </tr>
        <tr>
          <td colSpan="2" />
          <td className="subtext">
            <span className="score">{story.score + " points"}</span>
            {" by "}
            <a href="#" className="hnuser">
              {story.by}
            </a>{" "}
            <span className="age">
              <a href="#">{timeAge(story.time)}</a>
            </span>
            {" | "}
            <a href="#">hide</a>
            {" | "}
            <a href="#">{(story.descendants || 0) + " comments"}</a>
          </td>
        </tr>
        <tr
          style={{
            height: 5,
          }}
          className="spacer"
        />
      </React.Fragment>
    );
  }

  Story.propTypes = {
    story: PropTypes.shape({
      title: PropTypes.string,
      url: PropTypes.string,
      score: PropTypes.number,
      descendants: PropTypes.number,
      by: PropTypes.string,
      time: PropTypes.number,
    }),
    rank: PropTypes.number,
  };

  function StoryList({ stories }) {
    return (
      <tr>
        <td>
          <table cellPadding="0" cellSpacing="0" className="itemlist">
            <tbody>
              {// we use Array.from to tell the compiler that this
              // is definitely an array object
              Array.from(stories).map((story, i) => <Story story={story} rank={++i} key={story.id} />)}
            </tbody>
          </table>
        </td>
      </tr>
    );
  }

  function HeaderBar(props) {
    return (
      <tr style={{ backgroundColor: "#222" }}>
        <table
          style={{
            padding: 4,
          }}
          width="100%"
          cellSpacing="0"
          cellPadding="0"
        >
          <tbody>
            <tr>
              <td style={{ width: 18, paddingRight: 4 }}>
                <a href="#">
                  <img
                    src="logo.png"
                    width="16"
                    height="16"
                    style={{
                      border: "1px solid #00d8ff",
                    }}
                  />
                </a>
              </td>
              <td style={{ lineHeight: "12pt" }} height="10">
                <span className="pagetop">
                  <b className="hnname">{props.title}</b>
                  <a href="#">new</a>
                  {" | "}
                  <a href="#">comments</a>
                  {" | "}
                  <a href="#">show</a>
                  {" | "}
                  <a href="#">ask</a>
                  {" | "}
                  <a href="#">jobs</a>
                  {" | "}
                  <a href="#">submit</a>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </tr>
    );
  }

  HeaderBar.defaultProps = {
    title: "React HN Benchmark",
  };

  class AppBody extends React.Component {
    render() {
      return (
        <React.Fragment>
          <HeaderBar />
          <tr height="10" />
          <StoryList stories={this.props.stories} limit={this.props.storyLimit} />
        </React.Fragment>
      );
    }
  }

  AppBody.defaultProps = {
    storyLimit: 10,
  };

  function App({ stories }) {
    return (
      <center>
        <table
          id="hnmain"
          border="0"
          cellPadding="0"
          cellSpacing="0"
          width="85%"
          style={{
            backgroundColor: "#f6f6ef",
          }}
        >
          <tbody>{stories.length > 0 ? <AppBody stories={stories} /> : null}</tbody>
        </table>
      </center>
    );
  }

  App.getTrials = function(renderer, Root, data) {
    let results = [];
    renderer.update(<Root stories={data} />);
    results.push(["hacker news", renderer.toJSON()]);

    return results;
  };

  // we run the getTrials from both version rather than
  // from the non-compiled version
  App.independent = true;

  App.propTypes = {
    stories: PropTypes.array.isRequired,
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App);
  }

  return App;
});
