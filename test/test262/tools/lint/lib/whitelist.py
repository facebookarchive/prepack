def parse(handle):
    '''Parse the contents of the provided file descriptor as a linting
    whitelist file. Return a dictionary whose keys are test file names and
    whose values are Python sets of "Check" ID strings.'''

    whitelist = dict()

    for line in handle:
        if line.startswith('#'):
            continue

        parts = line.split()
        file_name = parts[0]
        check_names = set(parts[1:])

        assert file_name not in whitelist, (
            'Whitelist should have a single entry for each file')

        assert len(check_names) > 0, (
            'Each whitelist entry should specify at least on check')

        whitelist[file_name] = check_names

    return whitelist
