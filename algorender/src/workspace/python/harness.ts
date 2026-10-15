// The Python side of the code workspace: run once in Pyodide, it defines
// `run_request(request_json) -> result_json`, which runs a learner's function
// against visual arrays and reports what it did as RunEvents (protocol.ts).
//
// How it sees the learner's code:
// - Comparisons are rewritten (an AST pass) into `_viz_cmp(op, a, b)`, and an
//   indexed operand `arr[i]` into `_viz_cell(arr, i)`, so a comparison knows
//   which cells it read. Nothing else is rewritten.
// - Array arguments arrive as VisualList, which records writes, appends and
//   pops, and refuses the mutators that would change it without showing how.
// - Every event takes its line and variables from the innermost frame of the
//   learner's code, so helpers and while-condition re-checks get them right.
// - sys.settrace counts executed lines, so an endless loop stops with a message.

export const HARNESS = String.raw`
import ast
import builtins
import json
import math
import operator
import sys
import time

LEARNER = '<learner>'

# Lists longer than this show their first items, then the length.
LIST_SHOWN = 12
STR_SHOWN = 40
# Bigger integers lose precision in JavaScript.
MAX_SAFE_INT = 2 ** 53 - 1

_OPS = {
    '<': operator.lt, '<=': operator.le, '>': operator.gt,
    '>=': operator.ge, '==': operator.eq, '!=': operator.ne,
}
_AST_OPS = {
    ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>',
    ast.GtE: '>=', ast.Eq: '==', ast.NotEq: '!=',
}
_SKIP = object()


class _Stop(BaseException):
    """Ends a run at a limit. A BaseException, so 'except Exception:' in the
    learner's code can't swallow it."""


# The run in progress; the instrumented code and VisualList report to it.
_current = None


# ---------------------------------------------------------------------------
# Rendering values for the app
# ---------------------------------------------------------------------------

def _short(text):
    return text if len(text) <= STR_SHOWN else text[:STR_SHOWN - 1] + '…'


def _is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _number(x):
    """A number as JSON can carry it, or _SKIP."""
    if isinstance(x, float):
        return x if math.isfinite(x) else _SKIP
    if abs(x) <= MAX_SAFE_INT:
        return int(x)
    # Too big for an exact JS number: show it approximately, if at all.
    return float(x) if x.bit_length() <= 1000 else _SKIP


def _list_text(items, tuple_=False):
    shown = ', '.join(repr(x) for x in items[:LIST_SHOWN])
    if len(items) > LIST_SHOWN:
        shown += ', …'
    elif tuple_ and len(items) == 1:
        shown += ','
    text = '(' + shown + ')' if tuple_ else '[' + shown + ']'
    return text if len(items) <= LIST_SHOWN else f'{text} ({len(items)} items)'


def _var(value):
    """A local variable as the variables panel shows it, or _SKIP."""
    if value is None or isinstance(value, bool):
        return value
    if _is_number(value):
        return _number(value)
    if isinstance(value, str):
        return _short(value)
    if isinstance(value, (list, tuple)) and all(_is_number(x) for x in value):
        return _list_text(value, isinstance(value, tuple))
    return _SKIP


def _repr(value):
    try:
        return _short(repr(value))
    except Exception:
        return type(value).__name__


def _plain(value):
    """The non-cell side of a comparison: always something to show."""
    shown = _var(value)
    return _repr(value) if shown is _SKIP else shown


def _json(value, path=()):
    """The entry function's return value as JSON; anything else becomes text."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if _is_number(value):
        if isinstance(value, int) and abs(value) > MAX_SAFE_INT:
            return _text(value)  # exact as text rather than rounded
        shown = _number(value)
        return _text(value) if shown is _SKIP else shown
    if id(value) in path:  # a list that contains itself
        return '…'
    inner = path + (id(value),)
    if isinstance(value, VisualList):
        return list(value._values)
    if isinstance(value, (list, tuple)):
        return [_json(x, inner) for x in value]
    if isinstance(value, dict) and all(isinstance(k, str) for k in value):
        return {k: _json(v, inner) for k, v in value.items()}
    return _text(value)


def _text(value):
    try:
        return str(value)
    except Exception:
        return f'<{type(value).__name__}>'


# ---------------------------------------------------------------------------
# Where an event happened
# ---------------------------------------------------------------------------

def _learner_frame():
    frame = sys._getframe(1)
    while frame is not None and frame.f_code.co_filename != LEARNER:
        frame = frame.f_back
    return frame


def _locals(frame):
    out = {}
    for name, value in list(frame.f_locals.items()):
        if not isinstance(name, str) or name.startswith('_') or isinstance(value, VisualList):
            continue
        shown = _var(value)
        if shown is not _SKIP:
            out[name] = shown
    return out


def _error_line(error):
    """The last line of the learner's code in the traceback, or None."""
    line = None
    tb = error.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == LEARNER:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def _message(error):
    try:
        detail = str(error)
    except Exception:
        detail = ''
    name = type(error).__name__
    return f'{name}: {detail}' if detail else name


# ---------------------------------------------------------------------------
# Visual arrays
# ---------------------------------------------------------------------------

def _index(i):
    if isinstance(i, int):
        return int(i)
    if hasattr(type(i), '__index__'):
        return operator.index(i)
    raise TypeError(f'list indices must be integers or slices, not {type(i).__name__}')


class VisualList:
    """A list of numbers whose changes are shown on the array view."""

    __slots__ = ('_id', '_values')
    __hash__ = None

    def __init__(self, array_id, values):
        self._id = array_id
        self._values = list(values)

    def _at(self, i, message='list index out of range'):
        i = _index(i)
        n = len(self._values)
        if i < 0:
            i += n
        if not 0 <= i < n:
            raise IndexError(message)
        return i

    def _check(self, value, what):
        if not _is_number(value):
            raise TypeError(
                f"{self._id} holds numbers, so {what} can't store {_repr(value)} "
                f'(a {type(value).__name__}).'
            )
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError(f'{self._id} holds finite numbers, so {what} can\'t store {value}.')
        if isinstance(value, int) and abs(value) > MAX_SAFE_INT:
            raise ValueError(f'{self._id} holds numbers up to {MAX_SAFE_INT:,}; {what} got a bigger one.')

    # Reading
    def __getitem__(self, i):
        if isinstance(i, slice):
            return self._values[i]  # a plain copy, like a list slice
        return self._values[self._at(i)]

    def __len__(self):
        return len(self._values)

    def __iter__(self):
        return iter(self._values)

    def __reversed__(self):
        return reversed(self._values)

    def __contains__(self, value):
        return value in self._values

    def __repr__(self):
        return repr(self._values)

    __str__ = __repr__

    def __eq__(self, other):
        if isinstance(other, VisualList):
            return self._values == other._values
        if isinstance(other, list):
            return self._values == other
        return NotImplemented

    def __add__(self, other):
        return self._values + list(other)

    def __radd__(self, other):
        return list(other) + self._values

    def __mul__(self, n):
        return self._values * n

    __rmul__ = __mul__

    def index(self, *args):
        return self._values.index(*args)

    def count(self, value):
        return self._values.count(value)

    def copy(self):
        return list(self._values)

    # Changing: validate, report (which may stop the run), then change, so the
    # final contents always match the events.
    def __setitem__(self, i, value):
        if isinstance(i, slice):
            raise TypeError(
                f'Assigning to a slice of {self._id} would change many cells at once '
                'without showing the steps; assign one cell at a time.'
            )
        i = self._at(i, 'list assignment index out of range')
        self._check(value, f'{self._id}[{i}]')
        _current.emit('write', array=self._id, index=i, value=value)
        self._values[i] = value

    def append(self, value):
        self._check(value, f'{self._id}.append()')
        _current.emit('append', array=self._id, value=value)
        self._values.append(value)

    def pop(self, i=-1):
        if not self._values:
            raise IndexError('pop from empty list')
        i = self._at(i, 'pop index out of range')
        _current.emit('pop', array=self._id, index=i)
        return self._values.pop(i)

    # Mutators the view can't show step by step.
    def _refuse(self, what):
        raise TypeError(what)

    def sort(self, *args, **kwargs):
        self._refuse(f'{self._id}.sort() would sort without showing the steps; '
                     'write the comparisons and swaps yourself.')

    def reverse(self):
        self._refuse(f'{self._id}.reverse() would reverse without showing the steps; '
                     'swap the cells yourself.')

    def insert(self, *args):
        self._refuse(f'{self._id}.insert() would shift every later cell without showing the steps; '
                     f'use {self._id}.append() and move values with {self._id}[i] = ….')

    def extend(self, *args):
        self._refuse(f'{self._id}.extend() would add many values at once; '
                     f'use {self._id}.append() for each one.')

    def remove(self, *args):
        self._refuse(f'{self._id}.remove() would search and shift without showing the steps; '
                     f'find the index yourself and use {self._id}.pop(i).')

    def clear(self):
        self._refuse(f'{self._id}.clear() would empty the array without showing the steps; '
                     f'use {self._id}.pop() for each value.')

    def __delitem__(self, i):
        self._refuse(f'del {self._id}[…] isn\'t shown on the array; use {self._id}.pop(i) instead.')

    def __iadd__(self, other):
        self._refuse(f'{self._id} += … would add many values at once; '
                     f'use {self._id}.append() for each one.')

    def __imul__(self, other):
        self._refuse(f'{self._id} *= … would add many values at once; '
                     f'use {self._id}.append() for each one.')


class _Cell:
    """An array cell read by a comparison: which cell, and what it held."""

    __slots__ = ('array', 'index', 'value')

    def __init__(self, array, index, value):
        self.array = array
        self.index = index
        self.value = value


def _viz_cell(obj, index):
    if type(obj) is VisualList and not isinstance(index, slice):
        i = obj._at(index)
        return _Cell(obj._id, i, obj._values[i])
    return obj[index]


def _operand(x):
    if type(x) is _Cell:
        return {'array': x.array, 'index': x.index, 'value': x.value}
    return {'value': _plain(x)}


def _viz_cmp(op, a, b):
    left = a.value if type(a) is _Cell else a
    right = b.value if type(b) is _Cell else b
    result = _OPS[op](left, right)
    if type(a) is _Cell or type(b) is _Cell:
        _current.emit('compare', op=op, a=_operand(a), b=_operand(b), result=bool(result))
    return result


# ---------------------------------------------------------------------------
# Instrumenting the learner's code
# ---------------------------------------------------------------------------

def _is_plain_index(node):
    if isinstance(node, ast.Slice):
        return False
    if isinstance(node, ast.Tuple):
        return not any(isinstance(e, ast.Slice) for e in node.elts)
    return True


class _Instrument(ast.NodeTransformer):
    """a < b  becomes  _viz_cmp('<', a, b); an operand arr[i] becomes _viz_cell(arr, i).
    Chained comparisons and in/is are left as written."""

    def visit_Compare(self, node):
        self.generic_visit(node)
        if len(node.ops) != 1 or type(node.ops[0]) not in _AST_OPS:
            return node
        call = ast.Call(
            func=ast.Name('_viz_cmp', ast.Load()),
            args=[ast.Constant(_AST_OPS[type(node.ops[0])]),
                  self._operand(node.left), self._operand(node.comparators[0])],
            keywords=[],
        )
        return ast.copy_location(call, node)

    @staticmethod
    def _operand(node):
        if isinstance(node, ast.Subscript) and _is_plain_index(node.slice):
            call = ast.Call(func=ast.Name('_viz_cell', ast.Load()),
                            args=[node.value, node.slice], keywords=[])
            return ast.copy_location(call, node)
        return node


# ---------------------------------------------------------------------------
# A run
# ---------------------------------------------------------------------------

class _Run:
    def __init__(self, request):
        limits = request.get('limits') or {}
        self.max_events = int(limits.get('maxEvents', 5000))
        self.max_steps = int(limits.get('maxSteps', 200000))
        self.events = []
        self.arrays = {}
        self.steps = 0
        # Set when a limit stopped the run, even if the learner's code caught it.
        self.stopped = None

    def stop(self, message):
        self.stopped = message
        raise _Stop(message)

    def emit(self, kind, line=_SKIP, **fields):
        if self.stopped is not None:
            raise _Stop(self.stopped)
        if len(self.events) >= self.max_events:
            self.stop(f'Stopped after {self.max_events:,} events: '
                      'the code changed the array more times than the visual can show.')
        event = {'kind': kind, **fields}
        if line is _SKIP:
            frame = _learner_frame()
            event['line'] = frame.f_lineno if frame is not None else None
            event['vars'] = _locals(frame) if frame is not None else {}
        else:
            event['line'] = line
            event['vars'] = {}
        self.events.append(event)

    # sys.settrace: only the learner's frames get a line tracer.
    def trace_calls(self, frame, event, arg):
        if frame.f_code.co_filename == LEARNER:
            return self.trace_lines
        return None

    def trace_lines(self, frame, event, arg):
        if event == 'line':
            self.steps += 1
            if self.steps > self.max_steps:
                self.stop(f'Stopped after {self.max_steps:,} steps: is there a loop that never ends?')
        return self.trace_lines

    def print(self, *args, sep=' ', end='\n', file=None, flush=False):
        if sep is None:
            sep = ' '
        elif not isinstance(sep, str):
            raise TypeError(f'sep must be None or a string, not {type(sep).__name__}')
        self.emit('print', text=sep.join(str(a) for a in args))

    def arg(self, spec):
        if spec.get('kind') == 'array':
            name = spec['name']
            values = list(spec.get('values') or [])
            array = VisualList(name, values)
            self.arrays[name] = array
            self.emit('array', line=None, array=name, name=name, values=list(values))
            return array
        return spec.get('value')

    def result(self, returned, error, ms):
        return {
            'events': self.events,
            'arrays': {k: list(v._values) for k, v in self.arrays.items()},
            'returned': _json(returned),
            'error': error,
            'ms': ms,
        }


def _error(kind, message, line):
    return {'kind': kind, 'message': message, 'line': line}


def _run(request):
    global _current
    run = _Run(request)
    entry = request['entry']

    try:
        tree = _Instrument().visit(ast.parse(request['code'], LEARNER, 'exec'))
        code = compile(ast.fix_missing_locations(tree), LEARNER, 'exec')
    except SyntaxError as e:
        return run.result(None, _error('syntax', f'{type(e).__name__}: {e.msg}', e.lineno), 0)
    except ValueError as e:  # e.g. a null byte in the source
        return run.result(None, _error('syntax', f'SyntaxError: {e}', None), 0)

    namespace = {'__name__': '__main__', '__builtins__': builtins,
                 '_viz_cmp': _viz_cmp, '_viz_cell': _viz_cell}
    returned = None
    error = None
    real_print = builtins.print
    real_input = builtins.input
    _current = run
    builtins.print = run.print
    builtins.input = _no_input
    started = time.perf_counter()
    try:
        sys.settrace(run.trace_calls)
        try:
            exec(code, namespace)
            fn = namespace.get(entry)
            if not callable(fn):
                error = _error('runtime', f'Define a function called {entry}.', None)
            else:
                args = [run.arg(spec) for spec in request.get('args') or []]
                returned = fn(*args)
        finally:
            sys.settrace(None)
    except _Stop as e:
        error = _error('limit', str(e), _error_line(e))
    except BaseException as e:
        error = _error('runtime', _message(e), _error_line(e))
    finally:
        builtins.print = real_print
        builtins.input = real_input
        _current = None
    ms = (time.perf_counter() - started) * 1000

    if run.stopped is not None and (error is None or error['kind'] != 'limit'):
        # The learner's code caught the stop (a bare except); it still stopped.
        error = _error('limit', run.stopped, None)
        returned = None
    return run.result(returned, error, ms)


def _no_input(prompt=''):
    # There is no keyboard in the worker; the function's arguments are its input.
    raise RuntimeError('input() isn’t available here: your function gets its values as arguments.')


def run_request(request_json):
    """Runs one RunRequest (JSON) and returns its RunResult (JSON)."""
    try:
        return json.dumps(_run(json.loads(request_json)), allow_nan=False)
    except BaseException as e:  # a bug here, not in the learner's code
        sys.settrace(None)
        return json.dumps({
            'events': [], 'arrays': {}, 'returned': None, 'ms': 0,
            'error': _error('internal', f'The Python runner failed: {_message(e)}', None),
        })
`;
