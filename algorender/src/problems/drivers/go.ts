// The Go driver: package main in three files. solution.go is the learner's
// code under a //line directive (so errors and panics point at their lines),
// with common packages imported for them when they import nothing
// themselves; nodes.go has TreeNode and ListNode; main.go reads the tests,
// recovers each test's panic, and writes the answers. Every name in main.go
// starts with jdg, since the learner's code shares its package.

import { methodIn } from '../codegen';
import type { DesignSig, FunctionSig, Param, ValueType } from '../schema';
import { READER, type Program } from './shared';

/** Imported for learners who import nothing (Go refuses unused imports, hence the blank uses). */
const AUTO_IMPORTS = `import (
	"container/heap"
	"fmt"
	"math"
	"slices"
	"sort"
	"strconv"
	"strings"
)

var _ = heap.Init
var _ = fmt.Sprint
var _ = math.Abs
var _ = slices.Sort[[]int]
var _ = sort.Ints
var _ = strconv.Itoa
var _ = strings.Split
`;

const NODES = `package main

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

type ListNode struct {
	Val  int
	Next *ListNode
}
`;

const RUNTIME = String.raw`package main

import (
	"fmt"
	"math"
	"os"
	"reflect"
	"regexp"
	"runtime/debug"
	"strconv"
	"strings"
	"time"
)

var jdgIn []byte
var jdgPos int
var jdgAnswers *os.File

func jdgWs() {
	for jdgPos < len(jdgIn) && jdgIn[jdgPos] <= ' ' {
		jdgPos++
	}
}
func jdgTok() string {
	jdgWs()
	s := jdgPos
	for jdgPos < len(jdgIn) && jdgIn[jdgPos] > ' ' {
		jdgPos++
	}
	return string(jdgIn[s:jdgPos])
}
func jdgRInt() int       { v, _ := strconv.Atoi(jdgTok()); return v }
func jdgRLong() int      { v, _ := strconv.Atoi(jdgTok()); return v }
func jdgRFloat() float64 { v, _ := strconv.ParseFloat(jdgTok(), 64); return v }
func jdgRBool() bool     { return jdgTok() == "true" }
func jdgRString() string {
	jdgWs()
	s := jdgPos
	for jdgIn[jdgPos] != ':' {
		jdgPos++
	}
	n, _ := strconv.Atoi(string(jdgIn[s:jdgPos]))
	jdgPos++
	r := string(jdgIn[jdgPos : jdgPos+n])
	jdgPos += n
	return r
}
func jdgRIntArr() []int {
	a := make([]int, jdgRInt())
	for i := range a {
		a[i] = jdgRInt()
	}
	return a
}
func jdgRFloatArr() []float64 {
	a := make([]float64, jdgRInt())
	for i := range a {
		a[i] = jdgRFloat()
	}
	return a
}
func jdgRBoolArr() []bool {
	a := make([]bool, jdgRInt())
	for i := range a {
		a[i] = jdgRBool()
	}
	return a
}
func jdgRStringArr() []string {
	a := make([]string, jdgRInt())
	for i := range a {
		a[i] = jdgRString()
	}
	return a
}
func jdgRIntArr2() [][]int {
	a := make([][]int, jdgRInt())
	for i := range a {
		a[i] = jdgRIntArr()
	}
	return a
}
func jdgRFloatArr2() [][]float64 {
	a := make([][]float64, jdgRInt())
	for i := range a {
		a[i] = jdgRFloatArr()
	}
	return a
}
func jdgRStringArr2() [][]string {
	a := make([][]string, jdgRInt())
	for i := range a {
		a[i] = jdgRStringArr()
	}
	return a
}
func jdgRList() *ListNode {
	a := jdgRIntArr()
	var head *ListNode
	for i := len(a) - 1; i >= 0; i-- {
		head = &ListNode{Val: a[i], Next: head}
	}
	return head
}
func jdgRTree() *TreeNode {
	n := jdgRInt()
	v := make([]*int, n)
	for i := range v {
		if t := jdgTok(); t != "null" {
			x, _ := strconv.Atoi(t)
			v[i] = &x
		}
	}
	if n == 0 || v[0] == nil {
		return nil
	}
	root := &TreeNode{Val: *v[0]}
	waiting := []*TreeNode{root}
	i := 1
	for k := 0; i < n && k < len(waiting); k++ {
		node := waiting[k]
		if i < n && v[i] != nil {
			node.Left = &TreeNode{Val: *v[i]}
			waiting = append(waiting, node.Left)
		}
		i++
		if i < n && v[i] != nil {
			node.Right = &TreeNode{Val: *v[i]}
			waiting = append(waiting, node.Right)
		}
		i++
	}
	return root
}

func jdgStr(b *strings.Builder, s string) {
	b.WriteByte('"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"' || c == '\\':
			b.WriteByte('\\')
			b.WriteByte(c)
		case c == '\n':
			b.WriteString("\\n")
		case c < 0x20:
			fmt.Fprintf(b, "\\u%04x", c)
		default:
			b.WriteByte(c)
		}
	}
	b.WriteByte('"')
}

func jdgFloat(b *strings.Builder, f float64) {
	switch {
	case math.IsNaN(f):
		jdgStr(b, "NaN")
	case math.IsInf(f, 1):
		jdgStr(b, "Infinity")
	case math.IsInf(f, -1):
		jdgStr(b, "-Infinity")
	case f == 0:
		b.WriteByte('0')
	default:
		b.WriteString(strconv.FormatFloat(f, 'g', -1, 64))
	}
}

func jdgJSON(b *strings.Builder, v any) {
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
		return
	case *TreeNode:
		jdgTree(b, x)
		return
	case *ListNode:
		jdgList(b, x)
		return
	}
	r := reflect.ValueOf(v)
	switch r.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		b.WriteString(strconv.FormatInt(r.Int(), 10))
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		b.WriteString(strconv.FormatUint(r.Uint(), 10))
	case reflect.Float32, reflect.Float64:
		jdgFloat(b, r.Float())
	case reflect.Bool:
		b.WriteString(strconv.FormatBool(r.Bool()))
	case reflect.String:
		jdgStr(b, r.String())
	case reflect.Slice, reflect.Array:
		b.WriteByte('[')
		for i := 0; i < r.Len(); i++ {
			if i > 0 {
				b.WriteByte(',')
			}
			jdgJSON(b, r.Index(i).Interface())
		}
		b.WriteByte(']')
	case reflect.Map:
		b.WriteByte('[')
		for i, k := range r.MapKeys() {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteByte('[')
			jdgJSON(b, k.Interface())
			b.WriteByte(',')
			jdgJSON(b, r.MapIndex(k).Interface())
			b.WriteByte(']')
		}
		b.WriteByte(']')
	case reflect.Pointer, reflect.Interface:
		if r.IsNil() {
			b.WriteString("null")
		} else {
			jdgJSON(b, r.Elem().Interface())
		}
	default:
		jdgStr(b, fmt.Sprint(v))
	}
}

func jdgList(b *strings.Builder, head *ListNode) {
	var items strings.Builder
	seen := map[*ListNode]bool{}
	for node := head; node != nil; node = node.Next {
		if seen[node] {
			jdgStr(b, "not a list: it loops back to a node it already passed")
			return
		}
		if len(seen) >= 1000000 {
			jdgStr(b, "not a list: longer than 1,000,000 nodes")
			return
		}
		seen[node] = true
		if items.Len() > 0 {
			items.WriteByte(',')
		}
		items.WriteString(strconv.Itoa(node.Val))
	}
	b.WriteString("[" + items.String() + "]")
}

func jdgTree(b *strings.Builder, root *TreeNode) {
	waiting := []*TreeNode{root}
	seen := map[*TreeNode]bool{}
	items := []string{}
	for k := 0; k < len(waiting); k++ {
		node := waiting[k]
		if node == nil {
			items = append(items, "null")
			continue
		}
		if seen[node] || len(seen) >= 10000 {
			jdgStr(b, "not a tree: a node can be reached twice")
			return
		}
		seen[node] = true
		items = append(items, strconv.Itoa(node.Val))
		waiting = append(waiting, node.Left, node.Right)
	}
	for len(items) > 0 && items[len(items)-1] == "null" {
		items = items[:len(items)-1]
	}
	b.WriteString("[" + strings.Join(items, ",") + "]")
}

var jdgLineRe = regexp.MustCompile(` + "`solution\\.go:(\\d+)`" + String.raw`)

func jdgAnswer(t int, start time.Time, value any, hasValue bool, failure any, stack string) {
	var b strings.Builder
	ms := float64(time.Since(start).Nanoseconds()) / 1e6
	fmt.Fprintf(&b, "{\"i\":%d,\"ms\":%s", t, strconv.FormatFloat(ms, 'f', 3, 64))
	if hasValue {
		b.WriteString(",\"v\":")
		jdgJSON(&b, value)
	}
	if failure != nil {
		b.WriteString(",\"e\":")
		jdgStr(&b, "panic: "+fmt.Sprint(failure))
		if m := jdgLineRe.FindStringSubmatch(stack); m != nil {
			b.WriteString(",\"l\":" + m[1])
		}
	}
	b.WriteString("}\n")
	jdgAnswers.WriteString(b.String())
}

// jdgRun runs one test's calls, recovering a panic; a design problem keeps the results of the calls before it.
func jdgRun(t int, calls []func() any, design bool) {
	results := []any{}
	start := time.Now()
	var failure any
	var stack string
	func() {
		defer func() {
			if r := recover(); r != nil {
				failure = r
				stack = string(debug.Stack())
			}
		}()
		for _, call := range calls {
			results = append(results, call())
		}
	}()
	switch {
	case design:
		jdgAnswer(t, start, results, true, failure, stack)
	case failure != nil:
		jdgAnswer(t, start, nil, false, failure, stack)
	default:
		jdgAnswer(t, start, results[0], true, nil, "")
	}
}

func main() {
	debug.SetMaxStack(64 << 20)
	jdgIn, _ = os.ReadFile("/dev/stdin")
	jdgAnswers, _ = os.Create(os.Args[1])
	n := jdgRInt()
	for t := 0; t < n; t++ {
		os.Stdout.WriteString("\x1eALGORENDER-TEST " + strconv.Itoa(t) + "\n")
		jdgTest(t)
	}
	jdgAnswers.Close()
}
`;

const read = (t: ValueType) => `jdg${READER[t][0].toUpperCase()}${READER[t].slice(1)}()`;

/** Reads a test's arguments into a0, a1, … (each on its own line, in order). */
const readArgs = (params: Param[], prefix: string, indent: string) => params.map((p, i) => `${indent}${prefix}${i} := ${read(p.type)}\n`).join('');

function functionTest(sig: FunctionSig): string {
  const args = sig.params.map((_, i) => `a${i}`).join(', ');
  const inPlace = sig.params.findIndex((p) => p.name === sig.inPlace);
  const call = sig.returns === 'void' ? `${sig.function}(${args}); return a${inPlace}` : `return ${sig.function}(${args})`;
  return `func jdgTest(t int) {
${readArgs(sig.params, 'a', '\t')}	jdgRun(t, []func() any{func() any { ${call} }}, false)
}
`;
}

function designTest(d: DesignSig): string {
  const args = (params: Param[]) => params.map((_, i) => `x${i}`).join(', ');
  const cases = [
    `\t\tcase 0:\n${readArgs(d.init, 'x', '\t\t\t')}\t\t\tcalls = append(calls, func() any { obj = Constructor(${args(d.init)}); return nil })`,
    ...d.methods.map((m, k) => {
      const call = `obj.${methodIn(m.name, 'go')}(${args(m.params)})`;
      const body = m.returns === 'void' ? `${call}; return nil` : `return ${call}`;
      return `\t\tcase ${k + 1}:\n${readArgs(m.params, 'x', '\t\t\t')}\t\t\tcalls = append(calls, func() any { ${body} })`;
    }),
  ];
  return `func jdgTest(t int) {
	n := jdgRInt()
	var obj ${d.class}
	calls := []func() any{}
	for k := 0; k < n; k++ {
		switch jdgRInt() {
${cases.join('\n')}
		}
	}
	jdgRun(t, calls, true)
}
`;
}

export function goProgram(shape: { signature?: FunctionSig; design?: DesignSig }, code: string): Program {
  // A package clause of their own would be a second one: blank it, keeping the line count.
  const body = code.replace(/^\s*package\s+main\s*;?\s*$/m, '');
  const imports = /^\s*import\b/m.test(body) ? '' : AUTO_IMPORTS;
  const test = shape.signature ? functionTest(shape.signature) : designTest(shape.design!);
  return {
    source: 'solution.go',
    files: {
      'go.mod': 'module judge\n\ngo 1.22\n',
      'main.go': `${RUNTIME}\n${test}`,
      'nodes.go': NODES,
      'solution.go': `package main\n\n${imports}\n//line solution.go:1\n${body}`,
    },
  };
}
