# Contributing to Prepack
We want to make contributing to this project as easy and transparent as
possible.

To read more about the project, check out this [suggested reading wiki](https://github.com/facebook/prepack/wiki/Suggested-reading)

## Code of Conduct

Facebook has adopted a Code of Conduct that we expect project participants to adhere to. Please [read the full text](https://code.fb.com/codeofconduct/) so that you can understand what actions will and will not be tolerated.

## Our Development Process
The GitHub repository is the source of truth for us and all development takes place here.

## Pull Requests
We actively welcome your pull requests. If you are planning on doing a larger chunk of work, make sure to file an issue first to get feedback on your idea.

1. Fork the repo and create your branch from `master`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes, your code lints and typechecks. Your pull request might not get the attention it deserves if it fails in our automated continuous integration system.
5. If you haven't already, complete the Contributor License Agreement ("CLA").
6. Consider quashing your commits (`git rebase -i`). One intent alongside one commit makes it clearer for people to review and easier to understand your intention.
7. The main comment of a pull request must start with a sentence to be used in release notes prefixed with "Release Note: ". If the change is negligible, say "Release Note: none".

## Copyright Notice for files

Copy and paste this to the top of your new file(s):

```
/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
```

## Contributor License Agreement ("CLA")
In order to accept your pull request, we need you to submit a CLA. You only need
to do this once to work on any of Facebook's open source projects.

Complete your CLA here: <https://code.facebook.com/cla>

## Issues
We use GitHub issues to track public bugs. Please ensure your description is
clear and has sufficient instructions to be able to reproduce the issue.

Facebook has a [bounty program](https://www.facebook.com/whitehat/) for the safe
disclosure of security bugs. In those cases, please go through the process
outlined on that page and do not file a public issue.

## Coding Style
*Most important: Look around.* Match the style you see used in the rest of the project. This includes formatting, naming things in code, naming things in documentation.

Our basic code formatting rules are encoded in `.eslintrc` and are enforced by the linter.
When encoding functionality described in the JavaScript spec (http://www.ecma-international.org/ecma-262/7.0/), 
ensure that you copy+paste the relevant section number and individual steps.

## License
By contributing to Prepack, you agree that your contributions will be licensed
under the LICENSE file in the root directory of this source tree.
