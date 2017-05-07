#!/usr/bin/env python
# Copyright (C) 2016 the V8 project authors. All rights reserved.
# This code is governed by the BSD license found in the LICENSE file.

import os, shutil, subprocess, sys

OUT_DIR = os.environ.get('OUT_DIR') or 'test'
SRC_DIR = os.environ.get('SRC_DIR') or 'src'
UPSTREAM = os.environ.get('UPSTREAM') or 'git@github.com:tc39/test262.git'
MAINTAINER = os.environ.get('MAINTAINER') or 'test262@ecma-international.org'

def shell(*args):
    sp = subprocess.Popen(list(args), stdout=subprocess.PIPE)
    cmd_str = ' '.join(args)

    print '> ' + cmd_str

    for line in iter(sp.stdout.readline, ''):
        sys.stdout.write(line)

    sp.communicate()

    if sp.returncode == 1:
        raise Exception('Command failed: ' + cmd_str)

targets = dict()
def target(*deps):
    def other(orig):
        def wrapped():
            print 'Running target: ' + orig.__name__

            for dep in deps:
                targets[dep]()
            return orig()
        wrapped.__name__ = orig.__name__
        targets[orig.__name__] = wrapped
        return wrapped
    return other

@target()
def build():
    shell(sys.executable, 'tools/generation/generator.py',
          'create',
          '--out', OUT_DIR,
          SRC_DIR)

@target()
def clean():
    shell(sys.executable, 'tools/generation/generator.py', 'clean', OUT_DIR)

@target('clean', 'build')
def deploy():
    shell('git', 'add', '--all', OUT_DIR)
    shell('git', 'commit', '--message', '"Re-build from source"')
    shell('git', 'push', UPSTREAM, 'master')
    shell('git', 'checkout', '-')

# Generate a deploy key for use in a continuous integration system, allowing
# for automated deployment in response to merge events.
@target()
def github_deploy_key():
    shell('ssh-keygen',
          '-t', 'rsa',
          '-b', '4096',
          '-C', MAINTAINER,
          '-f', 'github-deploy-key')

# Encrypt the deploy key so that it may be included in the repository (to be
# decrypted by the continuous integration server during automated deployment)
# This requires the "travis" Ruby gem
# Source: https://docs.travis-ci.com/user/encrypting-files/
@target('github_deploy_key')
def github_deploy_key_enc():
    shell('travis', 'login')
    shell('travis', 'encrypt-file', 'github-deploy-key')

if len(sys.argv) == 1:
    targets['build']()

for target in sys.argv[1:]:
    if not target in targets:
        sys.stderr.write('No target named: "' + target + '".\n' +
            'Available targets: ' + ', '.join(list(targets)) + '\n')
        sys.exit(1)
    targets[target]()
