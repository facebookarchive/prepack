class Check(object):
    '''Base class for  defining linting checks.'''
    ID = None

    def run(self, name, meta, source):
        return True
